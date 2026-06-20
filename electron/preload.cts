const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
  getEvents: (date: string) => ipcRenderer.invoke("get-events", date),
  getStatus: (date?: string) => ipcRenderer.invoke("get-status", date),
  punchIn: () => ipcRenderer.invoke("punch-in"),
  punchOut: () => ipcRenderer.invoke("punch-out"),
  addEntry: (entry: {
    date: string
    time: string
    type: "LOGIN" | "LOGOUT"
    notes?: string
  }) => ipcRenderer.invoke("add-entry", entry),
  editEntry: (
    id: number,
    updates: { timestamp?: string; type?: string; notes?: string }
  ) => ipcRenderer.invoke("edit-entry", id, updates),
  deleteEntry: (id: number) => ipcRenderer.invoke("delete-entry", id),
  deleteEntries: (ids: number[]) => ipcRenderer.invoke("delete-entries", ids),
  addEntryPair: (data: { date: string; time1: string; time2: string }) =>
    ipcRenderer.invoke("add-entry-pair", data),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  updateSettings: (settings: Record<string, unknown>) =>
    ipcRenderer.invoke("update-settings", settings),
  onEventUpdate: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on("event-update", listener)
    return () => {
      ipcRenderer.removeListener("event-update", listener)
    }
  },

  // ── Day marks ──
  getDayMarks: () => ipcRenderer.invoke("get-day-marks"),
  setDayMark: (date: string, mark: string) =>
    ipcRenderer.invoke("set-day-mark", date, mark),
  deleteDayMark: (date: string) => ipcRenderer.invoke("delete-day-mark", date),

  // ── HRMS portal ──
  hrmsLogin: (email: string, password: string, baseUrl?: string) =>
    ipcRenderer.invoke("hrms-login", email, password, baseUrl),
  hrmsLogout: () => ipcRenderer.invoke("hrms-logout"),
  hrmsGetHours: (date?: string) => ipcRenderer.invoke("hrms-get-hours", date),
  hrmsGetStatus: () => ipcRenderer.invoke("hrms-get-status"),

  // ── Portal cache ──
  portalGetDay: (date: string, force?: boolean) =>
    ipcRenderer.invoke("portal-get-day", date, force),
  portalGetRange: (dates: string[], force?: boolean) =>
    ipcRenderer.invoke("portal-get-range", dates, force),
  portalCacheStatus: (date: string) =>
    ipcRenderer.invoke("portal-cache-status", date),
  portalInvalidate: (dates: string[]) =>
    ipcRenderer.invoke("portal-cache-invalidate", dates),
  portalInvalidateAll: () => ipcRenderer.invoke("portal-cache-invalidate-all"),
  portalPopulate: (dates: string[]) =>
    ipcRenderer.invoke("portal-cache-populate", dates),
  portalSyncNonPermanent: () =>
    ipcRenderer.invoke("portal-sync-non-permanent"),
  dailySyncRun: (force?: boolean) =>
    ipcRenderer.invoke("daily-sync-run", force),

  // ── Miss-punch playground drafts ──
  misspunchDraftGet: (date: string) =>
    ipcRenderer.invoke("misspunch-draft-get", date),
  misspunchDraftSet: (date: string, data: string) =>
    ipcRenderer.invoke("misspunch-draft-set", date, data),
  misspunchDraftDelete: (date: string) =>
    ipcRenderer.invoke("misspunch-draft-delete", date),

  // ── Day targets ──
  getAllDayTargets: () => ipcRenderer.invoke("get-all-day-targets"),
  getDayTarget: (date: string) => ipcRenderer.invoke("get-day-target", date),
  setDayTarget: (date: string, type: string, value: string | null) =>
    ipcRenderer.invoke("set-day-target", date, type, value),
  deleteDayTarget: (date: string) => ipcRenderer.invoke("delete-day-target", date),

  // ── Work windows ──
  getWorkWindow: (date: string) =>
    ipcRenderer.invoke("get-work-window", date),
  setWorkWindow: (
    date: string,
    startTime: string,
    endTime: string,
    source: "default" | "nightshift" | "manual" | "disabled"
  ) => ipcRenderer.invoke("set-work-window", date, startTime, endTime, source),
  deleteWorkWindow: (date: string) =>
    ipcRenderer.invoke("delete-work-window", date),
  getAllWorkWindows: () => ipcRenderer.invoke("get-all-work-windows"),

  // ── Leave data ──
  leaveSync: () => ipcRenderer.invoke("leave-sync"),

  // ── Hotkey / window ──
  onHotkeyPushShow: (callback: (triggerKey: string) => void) => {
    const listener = (_: unknown, triggerKey: string) => callback(triggerKey)
    ipcRenderer.on("hotkey:push-show", listener)
    return () => ipcRenderer.removeListener("hotkey:push-show", listener)
  },
  windowHide: () => ipcRenderer.invoke("window-hide"),
  windowToggleSize: () => ipcRenderer.invoke("window-toggle-size"),
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowMaximizeToggle: () => ipcRenderer.invoke("window:maximize-toggle"),
  windowClose: () => ipcRenderer.invoke("window:close"),
  windowIsMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  onWindowMaximized: (cb: (isMax: boolean) => void) => {
    const fn = (_: unknown, isMax: boolean) => cb(isMax)
    ipcRenderer.on("window:maximized", fn)
    return () => ipcRenderer.removeListener("window:maximized", fn)
  },
  onWindowFocus: (cb: (focused: boolean) => void) => {
    const fn = (_: unknown, focused: boolean) => cb(focused)
    ipcRenderer.on("window:focus", fn)
    return () => ipcRenderer.removeListener("window:focus", fn)
  },
  showNotification: (title: string, body: string) =>
    ipcRenderer.invoke("show-notification", title, body),
  restartApp: () => ipcRenderer.invoke("restart-app"),
  openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),

  // ── Auto-update ──
  getAppVersion: () => ipcRenderer.invoke("app:version"),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),

  onUpdateChecking: (cb: () => void) => {
    const fn = () => cb()
    ipcRenderer.on("update:checking", fn)
    return () => ipcRenderer.removeListener("update:checking", fn)
  },
  onUpdateAvailable: (cb: (info: { version: string; releaseNotes?: string }) => void) => {
    const fn = (_: unknown, info: { version: string; releaseNotes?: string }) => cb(info)
    ipcRenderer.on("update:available", fn)
    return () => ipcRenderer.removeListener("update:available", fn)
  },
  onUpdateNotAvailable: (cb: () => void) => {
    const fn = () => cb()
    ipcRenderer.on("update:not-available", fn)
    return () => ipcRenderer.removeListener("update:not-available", fn)
  },
  onUpdateProgress: (cb: (p: { percent: number; transferred: number; total: number }) => void) => {
    const fn = (_: unknown, p: { percent: number; transferred: number; total: number }) => cb(p)
    ipcRenderer.on("update:progress", fn)
    return () => ipcRenderer.removeListener("update:progress", fn)
  },
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => {
    const fn = (_: unknown, info: { version: string }) => cb(info)
    ipcRenderer.on("update:downloaded", fn)
    return () => ipcRenderer.removeListener("update:downloaded", fn)
  },
  onUpdateError: (cb: (msg: string) => void) => {
    const fn = (_: unknown, msg: string) => cb(msg)
    ipcRenderer.on("update:error", fn)
    return () => ipcRenderer.removeListener("update:error", fn)
  },

  // ── Claude usage ──
  getClaudeUsage: (): Promise<
    | { ok: true; data: { session: { utilization: number; resetsAt: string }; weekly: { utilization: number; resetsAt: string }; fetchedAt: number } }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('usage:claude-get'),

  // ── EOD Draft ──
  eodOpenInOutlook: (payload: {
    to: string
    cc: string
    subject: string
    htmlBody: string
    plainText: string
  }) => ipcRenderer.invoke('eod:open-in-outlook', payload) as Promise<{ method: 'com' | 'mailto' | 'eml' }>,

  onOutlookPhase: (cb: (phase: 'prewarming' | 'done') => void) => {
    const fn = (_e: unknown, phase: 'prewarming' | 'done') => cb(phase)
    ipcRenderer.on('eod:outlook-phase', fn)
    return () => ipcRenderer.removeListener('eod:outlook-phase', fn)
  },

  eodGetMeetingsToday: (): Promise<
    { ok: true; meetings: { title: string; duration: number; start: string; responseStatus: number }[] } |
    { ok: false; error: string }
  > => ipcRenderer.invoke('eod:get-meetings-today'),

  eodGetUpcomingLeaves: (windowDays: number): Promise<
    { ok: true; dates: string[] } | { ok: false; error: string }
  > => ipcRenderer.invoke('eod:get-upcoming-leaves', windowDays),

  // ── AI / Claude ──────────────────────────────────────────────────────────────

  // Buffered generation — resolves with full text when complete
  aiGenerate: (options: {
    prompt: string
    systemPrompt?: string
    model?: string
    timeoutMs?: number
    requestId?: string
  }): Promise<
    | { ok: true; text: string; durationMs: number }
    | { ok: false; error: string; code: string }
  > => ipcRenderer.invoke('ai:generate', options),

  // Streaming generation — call once, then listen for ai:chunk / ai:done / ai:error
  aiStream: (options: {
    prompt: string
    systemPrompt?: string
    model?: string
    timeoutMs?: number
    requestId?: string
  }): Promise<{ requestId: string }> => ipcRenderer.invoke('ai:stream', options),

  // Cancel an in-flight request (buffered or streaming)
  aiCancel: (requestId: string): void => {
    void ipcRenderer.invoke('ai:cancel', requestId)
  },

  // Alpha feature flag
  isAlphaUser: (): Promise<boolean> => ipcRenderer.invoke('alpha:is-user'),

  // Check if Claude Code is installed on this machine
  aiAvailable: (): Promise<{
    available: boolean
    version?: string
    error?: string
  }> => ipcRenderer.invoke('ai:available'),

  // Push event: streaming text chunk — returns a cleanup function
  onAiChunk: (cb: (data: { requestId: string; chunk: string }) => void) => {
    const fn = (_: unknown, data: { requestId: string; chunk: string }) => cb(data)
    ipcRenderer.on('ai:chunk', fn)
    return () => ipcRenderer.removeListener('ai:chunk', fn)
  },

  // Push event: streaming complete — returns a cleanup function
  onAiDone: (cb: (data: { requestId: string; text: string; durationMs: number }) => void) => {
    const fn = (_: unknown, data: { requestId: string; text: string; durationMs: number }) => cb(data)
    ipcRenderer.on('ai:done', fn)
    return () => ipcRenderer.removeListener('ai:done', fn)
  },

  // Push event: streaming or buffered error — returns a cleanup function
  onAiError: (cb: (data: { requestId: string; error: string; code: string }) => void) => {
    const fn = (_: unknown, data: { requestId: string; error: string; code: string }) => cb(data)
    ipcRenderer.on('ai:error', fn)
    return () => ipcRenderer.removeListener('ai:error', fn)
  },

  // ── EOD AI generation ──────────────────────────────────────────────────────

  // Starts a full EOD generation run; progress/result arrive via the
  // eod:ai-phase / eod:ai-done / eod:ai-error push events. Cancel with aiCancel(requestId).
  eodAiGenerate: (payload: {
    pastEods: Array<{ date: string; plainText: string }>
    meetings: Array<{ title: string; durationMin: number }>
    notes: string
    filterMode: 'blocklist' | 'allowlist'
    filterPaths: string[]
    instructions: string
  }): Promise<{ requestId: string }> => ipcRenderer.invoke('eod:ai-generate', payload),

  // Write-phase-only rerun of an existing draft with one refinement instruction
  eodAiRefine: (payload: {
    factSheet: unknown
    previousDraft: unknown
    instruction: string
    instructions: string
  }): Promise<{ requestId: string }> => ipcRenderer.invoke('eod:ai-refine', payload),

  // Projects seen in Claude sessions (today + historical) for the filter checklist
  eodAiListProjects: (): Promise<Array<{ path: string; sessionsToday: number }>> =>
    ipcRenderer.invoke('eod:ai-list-projects'),

  onEodAiPhase: (cb: (data: { requestId: string; phase: string; label: string }) => void) => {
    const fn = (_: unknown, data: { requestId: string; phase: string; label: string }) => cb(data)
    ipcRenderer.on('eod:ai-phase', fn)
    return () => ipcRenderer.removeListener('eod:ai-phase', fn)
  },

  onEodAiDone: (cb: (data: { requestId: string; draft: unknown; dropped: string[]; durationMs: number }) => void) => {
    const fn = (_: unknown, data: { requestId: string; draft: unknown; dropped: string[]; durationMs: number }) => cb(data)
    ipcRenderer.on('eod:ai-done', fn)
    return () => ipcRenderer.removeListener('eod:ai-done', fn)
  },

  onEodAiError: (cb: (data: { requestId: string; error: string; code: string; raw?: string }) => void) => {
    const fn = (_: unknown, data: { requestId: string; error: string; code: string; raw?: string }) => cb(data)
    ipcRenderer.on('eod:ai-error', fn)
    return () => ipcRenderer.removeListener('eod:ai-error', fn)
  },

  // ── Entries export ──
  exportFile: (format: "csv" | "json", date: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke("entries:export-file", { format, date }),

  showItemInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke("shell:show-item-in-folder", filePath),
})

contextBridge.exposeInMainWorld('licenseAPI', {
  getHwid: () => ipcRenderer.invoke('license:get-hwid'),
  submitLicense: (key: string) => ipcRenderer.invoke('license:submit', key),
  checkStatus: () => ipcRenderer.invoke('license:check-status'),
});