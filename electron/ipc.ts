import { app, ipcMain, BrowserWindow, Notification, shell } from "electron"
import os from "os"
import fs from "fs"
import path from "path"
import { spawn } from "child_process"
import { randomUUID } from "crypto"
import { registerHotkey } from "./hotkey"
import { syncLeaves } from "./leave-sync"
import { checkForUpdates, downloadUpdate, quitAndInstall } from "./updater"
import {
  getEntriesByDate,
  getLastEntry,
  getLastEntryByDate,
  insertEntry,
  insertEntryPair,
  updateEntry,
  deleteEntry,
  calculateTotalSecondsForDate,
  calculateWorkingSecondsForDate,
  resolveEffectiveMode,
  getEventCountForDate,
  getWeekSummaries,
  getAllDayMarks,
  setDayMark,
  deleteDayMark,
  getAllSettings,
  setSetting,
  getWorkWindow,
  setWorkWindow,
  deleteWorkWindow,
  getAllWorkWindows,
} from "./database"
import {
  hrmsLogin,
  hrmsGetWorkingHours,
  getHrmsConnectionStatus,
  clearCredentials,
} from "./hrms"
import {
  getFromCache,
  setToCache,
  isDatePermanent,
  getCacheStatus,
  invalidateDates,
  invalidateAll,
} from "./portal-cache"
import { syncNonPermanentDays } from "./portal-sync"
import { runDailySync } from "./daily-sync"
import ElectronStore from 'electron-store';
import { LicenseEngine } from './license-engine';

function getLocalDate(): string {
  return new Date().toLocaleDateString("en-CA") // YYYY-MM-DD
}

function buildSettingsResponse(raw: Record<string, string>) {
  return {
    dailyTargetMinutes: parseInt(raw.dailyTargetMinutes || "480", 10),
    autoStart: raw.autoStart === "true",
    startMinimized: raw.startMinimized === "true",
    debounceSeconds: parseInt(raw.debounceSeconds || "15", 10),
    heartbeatSeconds: parseInt(raw.heartbeatSeconds || "60", 10),
    closeToTray: raw.closeToTray === "true",
    hotkeyCombo: raw.hotkeyCombo || "Alt+Space",
    hotkeyMode: (raw.hotkeyMode || "press") as "press" | "push",
    hotkeyEnabled: raw.hotkeyEnabled !== "false",
    // Notifications
    notifyTargetEnabled: raw.notifyTargetEnabled === "true",
    notifyTargetMessage: raw.notifyTargetMessage || "Target completed for today",
    notifyTargetSource: (raw.notifyTargetSource || "local") as "local" | "portal",
    notifyEodEnabled: raw.notifyEodEnabled === "true",
    notifyEodMinutes: parseInt(raw.notifyEodMinutes || "5", 10),
    notifyEodMessage: raw.notifyEodMessage || "EOD Reminder! We are close to reach our target!",
    notifyEodSource: (raw.notifyEodSource || "local") as "local" | "portal",
    // Work boundary
    workBoundaryStart: raw.workBoundaryStart || "",
    workBoundaryEnd: raw.workBoundaryEnd || "",
    // Night shift
    nightShiftEnabled: raw.nightShiftEnabled === "true",
    nightShiftStart: raw.nightShiftStart || "22:00",
    nightShiftEnd: raw.nightShiftEnd || "06:00",
    // Notification fired-state persistence
    notificationsFiredKeys: raw.notificationsFiredKeys || "",
    // Onboarding
    onboardingCompleted: raw.onboardingCompleted === "true",
    onboardingVersion: parseInt(raw.onboardingVersion ?? "1", 10),
    // Release notes
    lastSeenVersion: raw.lastSeenVersion || "",
    releaseNotesPending: raw.releaseNotesPending === "true",
  }
}

// ── Window size toggle ────────────────────────────────────────────────────────
// Two fixed states: narrow (480×780) or maximized.
// No arbitrary intermediate sizes — future builds will enforce this strictly.
const NARROW_WIDTH = 480
const NARROW_HEIGHT = 780

const electronStore = new ElectronStore();
const licenseEngine = new LicenseEngine();

// ── EML helper ───────────────────────────────────────────────────────────────

// Returns null on success, or an error string if shell.openPath failed.
async function openViaEml(payload: OutlookPayload): Promise<string | null> {
  // Per-call unique id used for both the MIME boundary and the Message-ID.

  const uid = randomUUID()
  const boundary = `eod-${uid}`
  const messageId = `<${uid}@traccia.local>`
  const date = new Date().toUTCString()

  const headers: string[] = []
  if (payload.to) headers.push(`To: ${payload.to}`)
  if (payload.cc) headers.push(`Cc: ${payload.cc}`)
  headers.push(
    `Subject: ${payload.subject}`,
    `Date: ${date}`,
    `Message-ID: ${messageId}`,
    `X-Unsent: 1`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  )
  const plainText = (payload.plainText ?? '').replace(/\r?\n/g, '\r\n')
  const eml = [
    ...headers,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    plainText,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    payload.htmlBody,
    ``,
    `--${boundary}--`,
  ].join('\r\n')

  const filePath = path.join(os.tmpdir(), `eod-draft-${Date.now()}-${uid.slice(0, 8)}.eml`)
  fs.writeFileSync(filePath, eml, 'utf-8')
  const err = await shell.openPath(filePath)
  setTimeout(() => fs.unlink(filePath, () => {}), 30_000)
  return err || null
}

// ── Outlook COM helper ────────────────────────────────────────────────────────

interface OutlookPayload {
  to: string; cc: string; subject: string; htmlBody: string; plainText?: string
}

async function openViaOutlookCOM(payload: OutlookPayload): Promise<void> {
  // Create a per-operation temp directory to hold params and images. This allows
  // atomic removal of all artifacts and makes housekeeping straightforward.
  const prefix = path.join(os.tmpdir(), 'traccia-eod-')
  const tempDir = fs.mkdtempSync(prefix)

  const tempImageFiles: string[] = []
  const cidMeta: Array<{ path: string; cid: string }> = []
  let imgIdx = 0

  const processedHtml = payload.htmlBody.replace(
    /src="(data:image\/(png|jpe?g|gif|webp);base64,[^"]+)"/g,
    (_match, dataUri: string, ext: string) => {
      const cid = `eod-img-${imgIdx++}`
      const fileExt = ext === 'jpeg' ? 'jpg' : ext
      const tmpPath = path.join(tempDir, `${cid}.${fileExt}`)
      const base64Data = dataUri.replace(/^data:image\/[^;]+;base64,/, '')
      fs.writeFileSync(tmpPath, Buffer.from(base64Data, 'base64'))
      tempImageFiles.push(tmpPath)
      cidMeta.push({ path: tmpPath.replace(/\\/g, '/'), cid })
      return `src="cid:${cid}"`
    }
  )

  const paramsFile = path.join(tempDir, `eod-params-${Date.now()}.json`)
  fs.writeFileSync(paramsFile, JSON.stringify({
    to: payload.to,
    cc: payload.cc,
    subject: payload.subject,
    htmlBody: processedHtml,
    cidMeta,
  }), 'utf-8')

  const psPath = paramsFile.replace(/\\/g, '/')

  const psScript = `
    $ErrorActionPreference = 'Stop'
    try {
      $p = Get-Content -Path '${psPath}' -Raw -Encoding UTF8 | ConvertFrom-Json
      $outlook = New-Object -ComObject Outlook.Application
      $mail = $outlook.CreateItem(0)
      if ($p.to) { $mail.To = $p.to }
      if ($p.cc) { $mail.CC = $p.cc }
      $mail.Subject  = $p.subject
      $mail.HTMLBody = $p.htmlBody
      if ($p.cidMeta) {
        foreach ($img in $p.cidMeta) {
          if (Test-Path $img.path) {
            $att = $mail.Attachments.Add($img.path)
            $att.PropertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x3712001F', $img.cid)
            $att.PropertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x3716001E', 'inline')
            $att.PropertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x7FFE000B', $true)
          }
        }
      }
      $mail.Display()
      [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($outlook)
    } finally {
      Remove-Item -Path '${psPath}' -Force -ErrorAction SilentlyContinue
      if ($p -and $p.cidMeta) {
        foreach ($img in $p.cidMeta) {
          Remove-Item -Path $img.path -Force -ErrorAction SilentlyContinue
        }
      }
    }
  `

  // Helper: try to remove tempDir with a few attempts; if still failing,
  // persist the path in electronStore for startup housekeeping.
  const tryRemoveTempDir = (dir: string) => {
    const maxAttempts = 3
    let attempt = 0
    while (attempt < maxAttempts) {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
        return true
      } catch (err) {
        attempt++
      }
    }
    try {
      const pending: string[] = electronStore.get('pendingEodTempDirs') || []
      if (!pending.includes(dir)) {
        pending.push(dir)
        electronStore.set('pendingEodTempDirs', pending)
      }
    } catch { /* ignore */ }
    return false
  }

  await new Promise<void>((resolve, reject) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })

    let stderrBuf = ''
    let settled = false

    ps.stderr?.on('data', (d: Buffer) => { stderrBuf += d.toString() })

    const settle = (fn: () => void) => { if (!settled) { settled = true; fn() } }

    ps.on('error', (e) => settle(() => {
      tryRemoveTempDir(tempDir)
      reject(e)
    }))

    ps.on('close', (code) => settle(() => {
      tryRemoveTempDir(tempDir)
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(stderrBuf.trim() || `PowerShell exited ${code}`))
      }
    }))

    setTimeout(() => settle(() => { tryRemoveTempDir(tempDir); ps.unref(); resolve() }), 5000)
  })
}


export function registerIpcHandlers(
  onDataChange: () => void,
  getWindow: () => BrowserWindow | null
): void {
  // License handlers
  ipcMain.handle('license:get-hwid', () => licenseEngine.getHardwareId());
  
  ipcMain.handle('license:check-status', () => licenseEngine.verify(electronStore.get('license_key') as string));
  
  ipcMain.handle('license:submit', (_event, key: string) => {
    if (licenseEngine.verify(key)) {
      electronStore.set('license_key', key);
      return { success: true };
    }
    return { success: false, message: 'Invalid License Key' };
  });
  
  ipcMain.handle("shell:open-external", (_event, url: string) => {
    shell.openExternal(url)
  })

  ipcMain.handle("show-notification", (_event, title: string, body: string) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  })

  ipcMain.handle("restart-app", () => {
    app.relaunch()
    app.exit(0)
  })

  // ── Auto-update handlers ──
  ipcMain.handle("app:version", () => app.getVersion())

  ipcMain.handle("update:check", () => {
    if (app.isPackaged) checkForUpdates()
  })

  ipcMain.handle("update:download", () => {
    downloadUpdate()
  })

  ipcMain.handle("update:install", () => {
    quitAndInstall()
  })

  ipcMain.handle("get-events", (_event, date: string) => {
    return getEntriesByDate(date)
  })

  ipcMain.handle("get-status", (_event, date?: string) => {
    const targetDate = date || getLocalDate()
    const isToday = targetDate === getLocalDate()
    const lastEntry = isToday ? getLastEntry() : getLastEntryByDate(targetDate)
    const isIn = isToday ? lastEntry?.type === "LOGIN" : false
    const totalSecondsToday = calculateTotalSecondsForDate(targetDate)
    const workingSecondsToday = calculateWorkingSecondsForDate(targetDate)
    const eventCount = getEventCountForDate(targetDate)
    const mode = resolveEffectiveMode(targetDate)
    const workWindow = mode.type === "window" ? { start: mode.start, end: mode.end } : null

    return {
      isIn,
      lastEntry: lastEntry || null,
      totalSecondsToday,
      workingSecondsToday,
      eventCount,
      workWindow,
      workMode: mode.type,
    }
  })

  ipcMain.handle(
    "get-week-summaries",
    (_event, startDate: string, endDate: string) => {
      return getWeekSummaries(startDate, endDate)
    }
  )

  ipcMain.handle("punch-in", () => {
    const entry = insertEntry("LOGIN", "manual", "via manual")
    onDataChange()
    return entry
  })

  ipcMain.handle("punch-out", () => {
    const entry = insertEntry("LOGOUT", "manual", "via manual")
    onDataChange()
    return entry
  })

  ipcMain.handle(
    "add-entry",
    (
      _event,
      data: { date: string; time: string; type: "LOGIN" | "LOGOUT"; notes?: string }
    ) => {
      const timestamp = new Date(`${data.date}T${data.time}`).toISOString()

      // Reject future timestamps (60s grace for clock skew)
      if (new Date(timestamp).getTime() > Date.now() + 60_000) {
        throw new Error("Cannot add entry with a future timestamp")
      }

      // Reject exact duplicate timestamps on the same date
      const existing = getEntriesByDate(data.date)
      if (existing.some(e => e.timestamp === timestamp)) {
        throw new Error("An entry with this exact timestamp already exists")
      }

      // insertEntry handles consecutive-type guard (throws for manual source)
      const entry = insertEntry(data.type, "manual", "via manual", timestamp, data.notes)
      onDataChange()
      return entry
    }
  )

  ipcMain.handle(
    "add-entry-pair",
    (
      _event,
      data: { date: string; time1: string; time2: string }
    ) => {
      const ts1 = new Date(`${data.date}T${data.time1}`).toISOString()
      const ts2 = new Date(`${data.date}T${data.time2}`).toISOString()

      const laterTs = ts1 > ts2 ? ts1 : ts2
      if (new Date(laterTs).getTime() > Date.now() + 60_000) {
        throw new Error("Cannot add entry with a future timestamp")
      }

      const [firstEntry, secondEntry] = insertEntryPair(ts1, ts2, data.date)
      onDataChange()
      return { firstEntry, secondEntry }
    }
  )

  ipcMain.handle(
    "edit-entry",
    (
      _event,
      id: number,
      updates: { timestamp?: string; type?: string; notes?: string }
    ) => {
      // updateEntry validates sequence order internally (throws if pair would invert)
      const entry = updateEntry(id, updates)
      onDataChange()
      return entry
    }
  )

  ipcMain.handle("delete-entry", (_event, id: number) => {
    deleteEntry(id)
    onDataChange()
  })

  ipcMain.handle("delete-entries", (_event, ids: number[]) => {
    ids.forEach(id => deleteEntry(id))
    onDataChange()
  })

  ipcMain.handle("get-settings", () => {
    return buildSettingsResponse(getAllSettings())
  })

  ipcMain.handle(
    "update-settings",
    (_event, settings: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(settings)) {
        setSetting(key, String(value))
      }
      // Sync login item when autoStart changes
      if ("autoStart" in settings && app.isPackaged) {
        app.setLoginItemSettings({ openAtLogin: settings.autoStart === true })
      }
      // Re-register hotkey whenever hotkey settings change
      const HOTKEY_KEYS = ["hotkeyCombo", "hotkeyMode", "hotkeyEnabled"]
      if (HOTKEY_KEYS.some((k) => k in settings)) {
        const raw = getAllSettings()
        const win = getWindow()
        if (win) {
          registerHotkey(
            () => win,
            raw.hotkeyCombo || "Alt+Space",
            (raw.hotkeyMode || "press") as "press" | "push",
            raw.hotkeyEnabled !== "false"
          )
        }
      }
      onDataChange()
      return buildSettingsResponse(getAllSettings())
    }
  )

  // Hide window — used by push-to-display mode when trigger key is released
  ipcMain.handle("window-hide", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.hide()
  })

  // Toggle between compact narrow view and maximized (app shortcut "F")
  ipcMain.handle("window-toggle-size", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || getWindow()
    if (!win) return
    if (win.isMaximized()) {
      // Maximized → narrow fixed size
      win.unmaximize()
      win.setSize(NARROW_WIDTH, NARROW_HEIGHT, true)
      win.center()
    } else {
      // Narrow (or any non-maximized) → maximize
      win.maximize()
    }
  })

  // ── Native window controls ──

  ipcMain.handle("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle("window:maximize-toggle", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || getWindow()
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })

  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle("window:is-maximized", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  // ── HRMS portal handlers ──

  ipcMain.handle(
    "hrms-login",
    async (
      _event,
      email: string,
      password: string,
      baseUrl?: string
    ) => {
      if (baseUrl) setSetting("hrmsBaseUrl", baseUrl)
      return hrmsLogin(email, password)
    }
  )

  ipcMain.handle("hrms-logout", () => {
    clearCredentials()
  })

  ipcMain.handle("hrms-get-hours", async (_event, date?: string) => {
    return hrmsGetWorkingHours(date)
  })

  ipcMain.handle("get-day-marks", () => {
    return getAllDayMarks()
  })

  ipcMain.handle("set-day-mark", (_event, date: string, mark: string) => {
    setDayMark(date, mark)
  })

  ipcMain.handle("delete-day-mark", (_event, date: string) => {
    deleteDayMark(date)
  })

  ipcMain.handle("hrms-get-status", () => {
    return getHrmsConnectionStatus()
  })

  // ── Work window handlers ──

  ipcMain.handle("get-work-window", (_event, date: string) => {
    return getWorkWindow(date) || null
  })

  ipcMain.handle(
    "set-work-window",
    (
      _event,
      date: string,
      startTime: string,
      endTime: string,
      source: "default" | "nightshift" | "manual" | "disabled"
    ) => {
      setWorkWindow(date, startTime || null, endTime || null, source)
      onDataChange()
    }
  )

  ipcMain.handle("delete-work-window", (_event, date: string) => {
    deleteWorkWindow(date)
    onDataChange()
  })

  ipcMain.handle("get-all-work-windows", () => {
    return getAllWorkWindows()
  })

  // ── Portal cache handlers ──

  async function fetchAndCacheDay(
    date: string,
    force: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ data: any | null; fromCache: boolean; permanent: boolean; error?: string }> {

    // Reject future dates — portal API has no data for them
    if (date > getLocalDate()) {
      return { data: null, fromCache: false, permanent: false, error: "Future date" }
    }

    // Today's data is NEVER stored in SQLite — always fetch fresh from the API.
    // It lives only in the renderer's in-memory React state.
    if (date === getLocalDate()) {
      const apiDate = `${date}T00:00:00.000Z`
      const result = await hrmsGetWorkingHours(apiDate)
      return {
        data: result.success ? result : null,
        fromCache: false,
        permanent: false,
        error: result.success ? undefined : result.message,
      }
    }

    const permanent = isDatePermanent(date)

    // Permanent dates: always serve from cache (immutable biometric data)
    if (permanent) {
      const cached = getFromCache(date)
      if (cached) return { data: cached.data, fromCache: true, permanent: true }
      // Not cached yet — fall through to fetch
    }

    // Non-permanent past dates: serve from cache unless forced
    if (!force) {
      const cached = getFromCache(date)
      if (cached) return { data: cached.data, fromCache: true, permanent: false }
    }

    // Fetch from HRMS API and store in SQLite
    const apiDate = `${date}T00:00:00.000Z`
    const result = await hrmsGetWorkingHours(apiDate)
    if (result.success) {
      setToCache(date, result)
    }
    return {
      data: result.success ? result : null,
      fromCache: false,
      permanent: false,
      error: result.success ? undefined : result.message,
    }
  }

  ipcMain.handle(
    "portal-get-day",
    async (_event, date: string, force?: boolean) => {
      return fetchAndCacheDay(date, force ?? false)
    }
  )

  ipcMain.handle(
    "portal-get-range",
    async (_event, dates: string[], force?: boolean) => {
      const results = await Promise.all(
        dates.map(async (date) => {
          const result = await fetchAndCacheDay(date, force ?? false)
          return { date, ...result }
        })
      )
      return results
    }
  )

  ipcMain.handle("portal-cache-status", (_event, date: string) => {
    return getCacheStatus(date)
  })

  ipcMain.handle("portal-cache-invalidate", (_event, dates: string[]) => {
    invalidateDates(dates)
  })

  ipcMain.handle("portal-cache-invalidate-all", () => {
    invalidateAll()
  })

  // ── Leave data ──

  ipcMain.handle("leave-sync", async () => {
    const result = await syncLeaves()
    if (result.success) onDataChange()
    return result
  })

  ipcMain.handle("portal-cache-populate", async (_event, dates: string[]) => {
    // Fetch and cache all given dates (force-refresh regardless of cache state)
    const results = await Promise.all(
      dates.map(async (date) => {
        const result = await fetchAndCacheDay(date, true)
        return { date, success: result.data?.success ?? false }
      })
    )
    return results
  })

  // ── Non-permanent sync ──

  ipcMain.handle("portal-sync-non-permanent", async () => {
    return syncNonPermanentDays()
  })

  // ── EOD Draft ──

  ipcMain.handle("eod:open-in-outlook", async (_event, payload: {
    to: string
    cc: string
    subject: string
    htmlBody: string
    plainText: string
  }): Promise<{ method: 'com' | 'mailto' | 'eml' }> => {
    if (!payload.subject || !payload.htmlBody) {
      throw new Error("subject and htmlBody are required")
    }

    // ── Primary: EML file + shell.openPath ──────────────────────────────────────
    // shell.openPath routes to whatever the OS default .eml handler is.
    // New Outlook users get New Outlook; classic Outlook users get classic.
    // COM is kept as a fallback only for cases where EML routing fails.
    const emlResult = await openViaEml(payload)
    if (emlResult === null) return { method: 'eml' }

    // ── Fallback: PowerShell COM (classic Outlook only) ──────────────────────
    try {
      await openViaOutlookCOM(payload)
      return { method: 'com' }
    } catch (comErr) {
      throw new Error(`Failed to open in Outlook. EML: ${emlResult} | COM: ${String(comErr)}`)
    }
  })

  // ── Daily sync ──

  ipcMain.handle("daily-sync-run", async (_event, force?: boolean) => {
    const report = await runDailySync(force ?? false)
    // Notify renderer to reload day_marks — syncLeaves writes to day_marks table
    if (!report.skipped) onDataChange()
    return report
  })
}
