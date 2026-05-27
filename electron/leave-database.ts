/**
 * leave-database.ts — SQLite operations for leave records.
 *
 * Reusable by any feature that needs to read or write leave data
 * (calendar display, balance calculations, etc.)
 */

import { getDb } from "./database"

// ── Schema ────────────────────────────────────────────────────────────────────

export function initLeavesTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS leaves (
      app_id        INTEGER PRIMARY KEY,
      user_id       INTEGER NOT NULL,
      leave_type_id INTEGER NOT NULL,
      leave_name    TEXT    NOT NULL,
      start_date    TEXT    NOT NULL,  -- YYYY-MM-DD
      start_type    INTEGER NOT NULL,  -- 1=Full, 2=First Half, 3=Second Half
      end_date      TEXT    NOT NULL,  -- YYYY-MM-DD
      end_type      INTEGER NOT NULL,  -- 1=Full, 2=First Half
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
  `)
}

// ── Record type ───────────────────────────────────────────────────────────────

export interface LeaveRecord {
  app_id: number
  user_id: number
  leave_type_id: number
  leave_name: string
  start_date: string        // YYYY-MM-DD
  start_type: number
  end_date: string          // YYYY-MM-DD
  end_type: number
  total_days: number
  comment: string | null
  status: number
  is_approved_by_pm: boolean
  available_days: number | null
  created_at: string
  modified_at: string | null
  synced_at?: string
}

// ── Write ─────────────────────────────────────────────────────────────────────

export function upsertLeave(leave: LeaveRecord): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO leaves (
      app_id, user_id, leave_type_id, leave_name,
      start_date, start_type, end_date, end_type,
      total_days, comment, status, is_approved_by_pm,
      available_days, created_at, modified_at, synced_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, datetime('now')
    )
  `).run(
    leave.app_id, leave.user_id, leave.leave_type_id, leave.leave_name,
    leave.start_date, leave.start_type, leave.end_date, leave.end_type,
    leave.total_days, leave.comment ?? null, leave.status,
    leave.is_approved_by_pm ? 1 : 0,
    leave.available_days ?? null, leave.created_at, leave.modified_at ?? null
  )
}

export function clearLeaves(): void {
  getDb().prepare("DELETE FROM leaves").run()
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getApprovedLeaves(): LeaveRecord[] {
  return getDb()
    .prepare("SELECT * FROM leaves WHERE status = 5 ORDER BY start_date DESC")
    .all() as LeaveRecord[]
}

export function getLeavesByDateRange(startDate: string, endDate: string): LeaveRecord[] {
  // Returns leaves that overlap with [startDate, endDate]
  return getDb()
    .prepare(
      "SELECT * FROM leaves WHERE start_date <= ? AND end_date >= ? ORDER BY start_date ASC"
    )
    .all(endDate, startDate) as LeaveRecord[]
}

export function getLeavesForDate(date: string): LeaveRecord[] {
  return getLeavesByDateRange(date, date)
}

/**
 * Returns approved (status=5) leaves that overlap with [fromDate, toDate].
 * Both dates are YYYY-MM-DD strings. Used for EOD holiday auto-import.
 */
export function getUpcomingApprovedLeaves(fromDate: string, toDate: string): LeaveRecord[] {
  return getDb()
    .prepare(
      "SELECT * FROM leaves WHERE status = 5 AND start_date <= ? AND end_date >= ? ORDER BY start_date ASC"
    )
    .all(toDate, fromDate) as LeaveRecord[]
}

export function getLeaveCount(): number {
  const result = getDb()
    .prepare("SELECT COUNT(*) as count FROM leaves")
    .get() as { count: number }
  return result.count
}
