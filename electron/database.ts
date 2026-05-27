import Database from "better-sqlite3"
import path from "path"
import fs from "fs"
import { app } from "electron"

let db: Database.Database

export function getDb(): Database.Database {
  return db
}

export interface DBEntry {
  id: number
  timestamp: string
  date: string
  type: "LOGIN" | "LOGOUT"
  source: "auto" | "manual" | "estimated"
  trigger: string
  notes: string | null
  created_at: string
  modified_at: string | null
}

function getDbPath(): string {
  const userDataPath = app.getPath("userData")
  fs.mkdirSync(userDataPath, { recursive: true })
  return path.join(userDataPath, "data.db")
}

export function initDatabase(): void {
  const dbPath = getDbPath()
  db = new Database(dbPath)

  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")

  db.exec(`
    CREATE TABLE IF NOT EXISTS leaves (
      app_id        INTEGER PRIMARY KEY,
      user_id       INTEGER NOT NULL,
      leave_type_id INTEGER NOT NULL,
      leave_name    TEXT    NOT NULL,
      start_date    TEXT    NOT NULL,
      start_type    INTEGER NOT NULL,
      end_date      TEXT    NOT NULL,
      end_type      INTEGER NOT NULL,
      total_days    REAL    NOT NULL,
      comment       TEXT,
      status        INTEGER NOT NULL,
      is_approved_by_pm INTEGER NOT NULL DEFAULT 0,
      available_days REAL,
      created_at    TEXT    NOT NULL,
      modified_at   TEXT,
      synced_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_leaves_start_date ON leaves(start_date);
    CREATE INDEX IF NOT EXISTS idx_leaves_end_date   ON leaves(end_date);
    CREATE INDEX IF NOT EXISTS idx_leaves_status     ON leaves(status);

    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('LOGIN', 'LOGOUT')),
      source TEXT NOT NULL CHECK(source IN ('auto', 'manual', 'estimated')),
      trigger_label TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      modified_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
    CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON entries(timestamp);

    CREATE TABLE IF NOT EXISTS day_marks (
      date TEXT PRIMARY KEY,
      mark TEXT NOT NULL CHECK(mark IN ('mp', 'fl', 'hl'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portal_cache (
      date TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at TEXT NOT NULL,
      is_permanent INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS day_work_windows (
      date TEXT PRIMARY KEY,
      start_time TEXT,
      end_time TEXT,
      source TEXT NOT NULL CHECK(source IN ('default', 'nightshift', 'manual', 'disabled'))
    );

    CREATE TABLE IF NOT EXISTS day_targets (
      date  TEXT PRIMARY KEY,
      type  TEXT NOT NULL CHECK(type IN ('fixed','end-time','flex-balance','weekly-distribute','relative-offset')),
      value TEXT
    );
  `)

  // Migration: upgrade old day_work_windows schema (NOT NULL + missing 'disabled')
  {
    const colInfo = db.prepare("PRAGMA table_info(day_work_windows)").all() as { name: string; notnull: number }[]
    const startCol = colInfo.find(c => c.name === 'start_time')
    if (startCol?.notnull === 1) {
      db.exec(`
        CREATE TABLE day_work_windows_v2 (
          date TEXT PRIMARY KEY,
          start_time TEXT,
          end_time TEXT,
          source TEXT NOT NULL CHECK(source IN ('default','nightshift','manual','disabled'))
        );
        INSERT INTO day_work_windows_v2 SELECT * FROM day_work_windows;
        DROP TABLE day_work_windows;
        ALTER TABLE day_work_windows_v2 RENAME TO day_work_windows;
      `)
    }
  }

  // Migration: add relative-offset to day_targets type CHECK constraint
  {
    const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='day_targets'").get() as { sql: string } | undefined)?.sql ?? ""
    if (!sql.includes("relative-offset")) {
      db.exec(`
        CREATE TABLE day_targets_v2 (
          date  TEXT PRIMARY KEY,
          type  TEXT NOT NULL CHECK(type IN ('fixed','end-time','flex-balance','weekly-distribute','relative-offset')),
          value TEXT
        );
        INSERT INTO day_targets_v2 SELECT * FROM day_targets;
        DROP TABLE day_targets;
        ALTER TABLE day_targets_v2 RENAME TO day_targets;
      `)
    }
  }

  // Insert default settings if not exist
  const defaults: Record<string, string> = {
    dailyTargetMinutes: "480",
    autoStart: "true",
    startMinimized: "true",
    debounceSeconds: "15",
    heartbeatSeconds: "60",
    closeToTray: "true",
    hrmsBaseUrl: "https://roimaint.in:7000/api",
    // Hotkey
    hotkeyCombo: "Alt+Space",
    hotkeyMode: "press",
    hotkeyEnabled: "true",
    // Notifications
    notifyTargetEnabled: "false",
    notifyTargetMessage: "Target completed for today",
    notifyTargetSource: "local",
    notifyEodEnabled: "false",
    notifyEodMinutes: "5",
    notifyEodMessage: "EOD Reminder! We are close to reach our target!",
    notifyEodSource: "local",
    // Work boundary
    workBoundaryStart: "",
    workBoundaryEnd: "",
    // Night shift
    nightShiftEnabled: "false",
    nightShiftStart: "22:00",
    nightShiftEnd: "06:00",
    // Onboarding
    onboardingCompleted: "false",
    onboardingVersion: "1",
    // Release notes
    lastSeenVersion: "",
    releaseNotesPending: "false",
  }

  const insertSetting = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  )
  for (const [key, value] of Object.entries(defaults)) {
    insertSetting.run(key, value)
  }
}

export function insertEntry(
  type: "LOGIN" | "LOGOUT",
  source: "auto" | "manual" | "estimated",
  triggerLabel: string,
  timestamp?: string,
  notes?: string | null
): DBEntry {
  const now = timestamp || new Date().toISOString()
  const localDate = new Date(now).toLocaleDateString("en-CA") // YYYY-MM-DD

  // Sequence integrity guard: check positional neighbors at the insertion point
  const allForDate = db
    .prepare("SELECT * FROM entries WHERE date = ? ORDER BY timestamp ASC, id ASC")
    .all(localDate) as DBEntry[]

  const before = [...allForDate].reverse().find(e => e.timestamp < now) ?? null
  const after  = allForDate.find(e => e.timestamp > now) ?? null

  if (before && before.type === type) {
    if (source === "manual") {
      const oppLabel = type === "LOGIN" ? "logout" : "login"
      throw new Error(
        `Already ${type === "LOGIN" ? "checked in" : "checked out"} — add a ${oppLabel} before inserting another ${type === "LOGIN" ? "login" : "logout"}`
      )
    }
    // Auto/estimated: skip silently — caller already checked DB state; duplicate means
    // a race or out-of-sync event. Ghost compensating entries are worse than a no-op.
    return getLastEntry()!
  }

  if (after && after.type === type) {
    if (source === "manual") {
      const oppLabel = type === "LOGIN" ? "logout" : "login"
      throw new Error(
        `Next entry is also a ${type === "LOGIN" ? "login" : "logout"} — add a ${oppLabel} between them first`
      )
    }
    // Auto/estimated: skip silently — same reasoning as above.
    return getLastEntry()!
  }

  const stmt = db.prepare(`
    INSERT INTO entries (timestamp, date, type, source, trigger_label, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const result = stmt.run(
    now,
    localDate,
    type,
    source,
    triggerLabel,
    notes || null
  )

  // Snapshot the work window for this date if it's the first entry
  snapshotWorkWindowIfNeeded(localDate)

  return getEntryById(result.lastInsertRowid as number)!
}

export function getEntryById(id: number): DBEntry | undefined {
  return db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as
    | DBEntry
    | undefined
}

export function insertEntryPair(
  timestampA: string,
  timestampB: string,
  date: string,
  notes?: string | null
): [DBEntry, DBEntry] {
  // Sort so firstTs is always the earlier of the two
  const [firstTs, secondTs] = [timestampA, timestampB].sort()

  if (firstTs === secondTs) {
    throw new Error("Both entries have the same time — use different times")
  }

  let firstId!: number
  let secondId!: number

  const run = db.transaction(() => {
    // Auto-detect types from the entry immediately preceding the first timestamp
    const existing = db
      .prepare("SELECT * FROM entries WHERE date = ? ORDER BY timestamp ASC, id ASC")
      .all(date) as DBEntry[]

    // Duplicate timestamp guard
    if (existing.some(e => e.timestamp === firstTs || e.timestamp === secondTs)) {
      throw new Error("An entry with this exact timestamp already exists")
    }

    const before = [...existing].reverse().find(e => e.timestamp < firstTs) ?? null

    // If no preceding entry, start with LOGIN (new session); otherwise alternate from before
    const firstType: "LOGIN" | "LOGOUT" = !before
      ? "LOGIN"
      : before.type === "LOGIN" ? "LOGOUT" : "LOGIN"
    const secondType: "LOGIN" | "LOGOUT" = firstType === "LOGOUT" ? "LOGIN" : "LOGOUT"

    const r1 = db.prepare(
      `INSERT INTO entries (timestamp, date, type, source, trigger_label, notes) VALUES (?, ?, ?, 'manual', 'via manual', ?)`
    ).run(firstTs, date, firstType, notes ?? null)
    firstId = r1.lastInsertRowid as number

    const r2 = db.prepare(
      `INSERT INTO entries (timestamp, date, type, source, trigger_label, notes) VALUES (?, ?, ?, 'manual', 'via manual', ?)`
    ).run(secondTs, date, secondType, notes ?? null)
    secondId = r2.lastInsertRowid as number

    // Full alternating check after both insertions
    const sorted = db
      .prepare("SELECT * FROM entries WHERE date = ? ORDER BY timestamp ASC, id ASC")
      .all(date) as DBEntry[]

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].type === sorted[i - 1].type) {
        const label = sorted[i].type === "LOGIN" ? "logins" : "logouts"
        throw new Error(
          `Invalid times — creates two consecutive ${label}. Adjust the times to fit the existing sequence.`
        )
      }
    }
  })

  run()
  snapshotWorkWindowIfNeeded(date)
  return [getEntryById(firstId)!, getEntryById(secondId)!]
}

export function getEntriesByDate(date: string): DBEntry[] {
  return db
    .prepare(
      "SELECT * FROM entries WHERE date = ? ORDER BY timestamp DESC, id DESC"
    )
    .all(date) as DBEntry[]
}

export function getLastEntry(): DBEntry | undefined {
  return db.prepare("SELECT * FROM entries ORDER BY id DESC LIMIT 1").get() as
    | DBEntry
    | undefined
}

export function getLastEntryByDate(date: string): DBEntry | undefined {
  return db
    .prepare(
      "SELECT * FROM entries WHERE date = ? ORDER BY timestamp DESC, id DESC LIMIT 1"
    )
    .get(date) as DBEntry | undefined
}

export function updateEntry(
  id: number,
  updates: { timestamp?: string; type?: string; notes?: string }
): DBEntry {
  const entry = getEntryById(id)
  if (!entry) throw new Error(`Entry ${id} not found`)

  const newTimestamp = updates.timestamp || entry.timestamp
  const newDate = new Date(newTimestamp).toLocaleDateString("en-CA")
  const newType = (updates.type as "LOGIN" | "LOGOUT") || entry.type
  const newNotes = updates.notes !== undefined ? updates.notes : entry.notes

  // Validate that the edit doesn't invert a LOGIN/LOGOUT pair
  const runUpdate = db.transaction(() => {
    db.prepare(
      `UPDATE entries
       SET timestamp = ?, date = ?, type = ?, notes = ?, modified_at = datetime('now')
       WHERE id = ?`
    ).run(newTimestamp, newDate, newType, newNotes, id)

    // Re-read all entries for the affected date, sorted chronologically
    const sorted = (db
      .prepare("SELECT * FROM entries WHERE date = ? ORDER BY timestamp ASC, id ASC")
      .all(newDate) as DBEntry[])

    // Full alternating sequence check — any two adjacent same-type entries = corrupt
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].type === sorted[i - 1].type) {
        const label = sorted[i].type === "LOGIN" ? "logins" : "logouts"
        throw new Error(
          `Invalid time — this creates two consecutive ${label}. Adjust to keep the sequence alternating (in, out, in, out…).`
        )
      }
    }
  })

  runUpdate()
  return getEntryById(id)!
}

export function deleteEntry(id: number): void {
  db.prepare("DELETE FROM entries WHERE id = ?").run(id)
}

export function calculateTotalSecondsForDate(date: string): number {
  const entries = db
    .prepare(
      "SELECT * FROM entries WHERE date = ? ORDER BY timestamp ASC, id ASC"
    )
    .all(date) as DBEntry[]

  let totalSeconds = 0
  let loginTime: Date | null = null

  for (const entry of entries) {
    if (entry.type === "LOGIN") {
      loginTime = new Date(entry.timestamp)
    } else if (entry.type === "LOGOUT" && loginTime) {
      const logoutTime = new Date(entry.timestamp)
      totalSeconds += (logoutTime.getTime() - loginTime.getTime()) / 1000
      loginTime = null
    }
  }

  // If currently logged in (or unclosed session on past date), cap appropriately
  if (loginTime) {
    const today = new Date().toLocaleDateString("en-CA")
    if (date === today) {
      totalSeconds += (Date.now() - loginTime.getTime()) / 1000
    } else {
      // Past date: cap at local end-of-day — never bleed into today
      const endOfDay = new Date(`${date}T23:59:59.999`).getTime()
      totalSeconds += Math.max(0, endOfDay - loginTime.getTime()) / 1000
    }
  }

  return Math.max(0, Math.floor(totalSeconds))
}

export function getEventCountForDate(date: string): number {
  const result = db
    .prepare("SELECT COUNT(*) as count FROM entries WHERE date = ?")
    .get(date) as { count: number }
  return result.count
}

export function getAllDayMarks(): { date: string; mark: string }[] {
  return db
    .prepare("SELECT date, mark FROM day_marks ORDER BY date ASC")
    .all() as { date: string; mark: string }[]
}

export function setDayMark(date: string, mark: string): void {
  db.prepare("INSERT OR REPLACE INTO day_marks (date, mark) VALUES (?, ?)").run(
    date,
    mark
  )
}

export function deleteDayMark(date: string): void {
  db.prepare("DELETE FROM day_marks WHERE date = ?").run(date)
}

export function getWeekSummaries(
  startDate: string,
  endDate: string
): { date: string; totalSeconds: number; eventCount: number }[] {
  const dates = db
    .prepare(
      "SELECT DISTINCT date FROM entries WHERE date >= ? AND date <= ? ORDER BY date ASC"
    )
    .all(startDate, endDate) as { date: string }[]

  return dates.map(({ date }) => ({
    date,
    totalSeconds: calculateTotalSecondsForDate(date),
    eventCount: getEventCountForDate(date),
  }))
}

export function getSetting(key: string): string | undefined {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined
  return row?.value
}

export function setSetting(key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    key,
    value
  )
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string
    value: string
  }[]
  const settings: Record<string, string> = {}
  for (const row of rows) {
    settings[row.key] = row.value
  }
  return settings
}

// ── Work windows ─────────────────────────────────────────────────────────────

export interface DBWorkWindow {
  date: string
  start_time: string | null
  end_time: string | null
  source: "default" | "nightshift" | "manual" | "disabled"
}

export function getWorkWindow(date: string): DBWorkWindow | undefined {
  return db
    .prepare("SELECT * FROM day_work_windows WHERE date = ?")
    .get(date) as DBWorkWindow | undefined
}

export function setWorkWindow(
  date: string,
  startTime: string | null,
  endTime: string | null,
  source: "default" | "nightshift" | "manual" | "disabled"
): void {
  db.prepare(
    "INSERT OR REPLACE INTO day_work_windows (date, start_time, end_time, source) VALUES (?, ?, ?, ?)"
  ).run(date, startTime || null, endTime || null, source)
}

export function deleteWorkWindow(date: string): void {
  db.prepare("DELETE FROM day_work_windows WHERE date = ?").run(date)
}

export function getAllWorkWindows(): DBWorkWindow[] {
  return db
    .prepare("SELECT * FROM day_work_windows ORDER BY date ASC")
    .all() as DBWorkWindow[]
}

// ── Day targets ──────────────────────────────────────────────────────────────

export type DayTargetType = "fixed" | "end-time" | "flex-balance" | "weekly-distribute" | "relative-offset"

export interface DBDayTarget {
  date: string
  type: DayTargetType
  value: string | null
}

export function getDayTarget(date: string): DBDayTarget | undefined {
  return db
    .prepare("SELECT * FROM day_targets WHERE date = ?")
    .get(date) as DBDayTarget | undefined
}

export function setDayTarget(date: string, type: DayTargetType, value: string | null): void {
  db.prepare(
    "INSERT OR REPLACE INTO day_targets (date, type, value) VALUES (?, ?, ?)"
  ).run(date, type, value ?? null)
}

export function deleteDayTarget(date: string): void {
  db.prepare("DELETE FROM day_targets WHERE date = ?").run(date)
}

export function getAllDayTargets(): DBDayTarget[] {
  return db
    .prepare("SELECT * FROM day_targets ORDER BY date ASC")
    .all() as DBDayTarget[]
}

// ── Effective day mode ────────────────────────────────────────────────────────

type DayMode =
  | { type: "holiday" }                              // count 0 seconds
  | { type: "all" }                                  // count all entries
  | { type: "window"; start: string; end: string }   // clamp to window

function isWeekend(date: string): boolean {
  const dow = new Date(date + "T00:00:00").getDay()
  return dow === 0 || dow === 6
}

function getDayMark(date: string): string | null {
  const row = db
    .prepare("SELECT mark FROM day_marks WHERE date = ?")
    .get(date) as { mark: string } | undefined
  return row?.mark ?? null
}

/**
 * Resolve the effective day mode for time calculation.
 *
 * Priority:
 *   1. Weekend → holiday (count 0)
 *   2. Leave mark (fl/hl) → holiday (count 0)
 *   3. Stored 'disabled' row → all (count everything)
 *   4. Stored 'nightshift'/'manual' row → window
 *   5. Stored 'default' row — only if global boundary still enabled
 *   6. Global boundary setting → window
 *   7. Fallback → all
 */
export function resolveEffectiveMode(date: string): DayMode {
  if (isWeekend(date)) return { type: "holiday" }

  const mark = getDayMark(date)
  if (mark === "fl" || mark === "hl") return { type: "holiday" }

  const stored = getWorkWindow(date)
  if (stored) {
    if (stored.source === "disabled") return { type: "all" }
    if (stored.source === "nightshift" || stored.source === "manual") {
      if (stored.start_time && stored.end_time) {
        return { type: "window", start: stored.start_time, end: stored.end_time }
      }
      // Corrupted row (missing times) — fall through to global/fallback
    }
    // source === 'default': only valid if global boundary still enabled
    if (stored.source === "default") {
      const globalStart = getSetting("workBoundaryStart")
      const globalEnd = getSetting("workBoundaryEnd")
      if (globalStart && globalEnd && stored.start_time && stored.end_time) {
        return { type: "window", start: stored.start_time, end: stored.end_time }
      }
      // Global disabled or corrupted row — ignore stale snapshot, fall through
    }
  }

  const start = getSetting("workBoundaryStart")
  const end = getSetting("workBoundaryEnd")
  if (start && end) return { type: "window", start, end }

  return { type: "all" }
}

/**
 * Resolve work window { start, end } for a date, or null if no window applies.
 * Used by IPC get-status to populate PunchStatus.workWindow for the renderer.
 */
export function resolveWorkWindow(
  date: string
): { start: string; end: string } | null {
  const mode = resolveEffectiveMode(date)
  if (mode.type === "window") return { start: mode.start, end: mode.end }
  return null
}

/**
 * Snapshot the current default work boundary for a date if no window exists yet.
 * Called when the first entry lands on a new date.
 */
export function snapshotWorkWindowIfNeeded(date: string): void {
  const existing = getWorkWindow(date)
  if (existing) return

  const start = getSetting("workBoundaryStart")
  const end = getSetting("workBoundaryEnd")
  if (start && end) {
    setWorkWindow(date, start, end, "default")
  }
}

/**
 * Calculate working seconds for a date using the effective day mode.
 *   holiday → 0
 *   all     → same as calculateTotalSecondsForDate
 *   window  → sessions clamped to window ranges
 */
export function calculateWorkingSecondsForDate(date: string): number {
  const mode = resolveEffectiveMode(date)
  if (mode.type === "holiday") return 0
  if (mode.type === "all") return calculateTotalSecondsForDate(date)

  const entries = db
    .prepare(
      "SELECT * FROM entries WHERE date = ? ORDER BY timestamp ASC, id ASC"
    )
    .all(date) as DBEntry[]

  return sumSessionsWithWindow(entries, mode, date)
}

/**
 * Build the time ranges for a work window on a given date.
 * Normal window (start < end): single range [start, end].
 * Wrapped window (start > end, e.g. 22:00–06:00): two ranges
 *   [00:00, end] and [start, 24:00] on the same calendar date.
 */
function buildWindowRanges(
  window: { start: string; end: string },
  date: string
): Array<[number, number]> {
  const winStart = new Date(`${date}T${window.start}:00`).getTime()
  const winEnd = new Date(`${date}T${window.end}:00`).getTime()

  if (winStart <= winEnd) {
    return [[winStart, winEnd]]
  }

  // Wrapped: early morning [00:00, end] + late night [start, 24:00]
  const dayStart = new Date(`${date}T00:00:00`).getTime()
  const dayEnd = new Date(`${date}T23:59:59`).getTime() + 1000
  return [
    [dayStart, winEnd],
    [winStart, dayEnd],
  ]
}

/**
 * Core clamping logic: sum LOGIN→LOGOUT pairs clamped to a work window.
 */
function sumSessionsWithWindow(
  entries: DBEntry[],
  window: { start: string; end: string },
  date: string
): number {
  const ranges = buildWindowRanges(window, date)

  let totalSeconds = 0
  let loginTime: number | null = null

  for (const entry of entries) {
    if (entry.type === "LOGIN") {
      loginTime = new Date(entry.timestamp).getTime()
    } else if (entry.type === "LOGOUT" && loginTime !== null) {
      const logoutTime = new Date(entry.timestamp).getTime()
      for (const [rStart, rEnd] of ranges) {
        totalSeconds += clampedDuration(loginTime, logoutTime, rStart, rEnd)
      }
      loginTime = null
    }
  }

  // If currently logged in (or unclosed session on past date), cap appropriately
  if (loginTime !== null) {
    const today = new Date().toLocaleDateString("en-CA")
    let cap: number
    if (date === today) {
      cap = Date.now()
    } else {
      cap = new Date(`${date}T23:59:59.999`).getTime()
    }
    for (const [rStart, rEnd] of ranges) {
      totalSeconds += clampedDuration(loginTime, cap, rStart, rEnd)
    }
  }

  return Math.max(0, Math.floor(totalSeconds))
}

function clampedDuration(
  start: number,
  end: number,
  winStart: number,
  winEnd: number
): number {
  const effectiveStart = Math.max(start, winStart)
  const effectiveEnd = Math.min(end, winEnd)
  if (effectiveStart >= effectiveEnd) return 0
  return (effectiveEnd - effectiveStart) / 1000
}

export function closeDatabase(): void {
  if (db) {
    db.close()
  }
}

/**
 * Find the paired counterpart of an entry (LOGIN↔LOGOUT adjacency in sorted order).
 * sortedEntries must be sorted by (timestamp ASC, id ASC).
 */
export function findPairedEntry(sortedEntries: DBEntry[], targetId: number): DBEntry | null {
  const idx = sortedEntries.findIndex(e => e.id === targetId)
  if (idx === -1) return null
  const target = sortedEntries[idx]

  if (target.type === "LOGIN") {
    // Walk forward: next LOGOUT with no intervening LOGIN
    for (let i = idx + 1; i < sortedEntries.length; i++) {
      if (sortedEntries[i].type === "LOGOUT") return sortedEntries[i]
      if (sortedEntries[i].type === "LOGIN") break
    }
  } else {
    // Walk backward: most recent LOGIN with no intervening LOGOUT
    for (let i = idx - 1; i >= 0; i--) {
      if (sortedEntries[i].type === "LOGIN") return sortedEntries[i]
      if (sortedEntries[i].type === "LOGOUT") break
    }
  }
  return null
}
