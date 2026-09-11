/**
 * leave-sync.ts — orchestrates fetching leave data and updating local state.
 *
 * Two responsibilities:
 *  1. Fetch approved leaves from portal → store in `leaves` table
 *  2. Apply those leaves → update `day_marks` table (fl / hl)
 *
 * Both are exported independently so other features can reuse them.
 */

import { fetchLeaveApplications, LEAVE_STATUS } from "./leave-api"
import { upsertLeave, getApprovedLeaves } from "./leave-database"
import { setDayMark } from "./database"

export interface LeaveSyncResult {
  success: boolean
  synced: number // approved leaves stored
  total: number // total leaves returned by API
  daysMarked: number // day_marks rows written
  message?: string
}

// ── Day-mark helpers ──────────────────────────────────────────────────────────

/** Expands a date range into individual YYYY-MM-DD strings (inclusive). */
function eachDateInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const current = new Date(startDate + "T00:00:00")
  const end = new Date(endDate + "T00:00:00")
  while (current <= end) {
    dates.push(current.toLocaleDateString("en-CA"))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

/**
 * Reads all approved leaves from the local DB and writes corresponding
 * day_marks entries.
 *
 * Rules:
 *  - Full day  (start_type=1)               → "fl"
 *  - Half day  (start_type=2 or 3)          → "hl"  (first/second half both = hl)
 *  - Multi-day leave first day              → determined by start_type
 *  - Multi-day leave last day               → determined by end_type (2=half → hl)
 *  - Multi-day middle days                  → always "fl"
 *
 * Exported separately so it can be called standalone (e.g. after a manual
 * DB import) without triggering a network fetch.
 */
export function applyLeavesToDayMarks(): number {
  const leaves = getApprovedLeaves()
  let daysMarked = 0

  for (const leave of leaves) {
    const dates = eachDateInRange(leave.start_date, leave.end_date)

    for (let i = 0; i < dates.length; i++) {
      const isFirst = i === 0
      const isLast = i === dates.length - 1
      const isSingleDay = dates.length === 1

      let mark: "fl" | "hl"

      if (isSingleDay || isFirst) {
        // First (or only) day: start_type drives the mark
        mark = leave.start_type === 2 || leave.start_type === 3 ? "hl" : "fl"
      } else if (isLast) {
        // Last day of multi-day: end_type 2 = first half → half day
        mark = leave.end_type === 2 ? "hl" : "fl"
      } else {
        // Middle days of a multi-day leave are always full
        mark = "fl"
      }

      setDayMark(dates[i], mark)
      daysMarked++
    }
  }

  return daysMarked
}

// ── Main sync ─────────────────────────────────────────────────────────────────

/**
 * Full sync: fetches approved leaves from portal, stores them, then updates
 * day_marks so the calendar reflects leave days automatically.
 */
export async function syncLeaves(): Promise<LeaveSyncResult> {
  // Fetch all leaves — no status filter — API has no date range filter so we pull everything
  const result = await fetchLeaveApplications()

  if (!result.success) {
    return {
      success: false,
      synced: 0,
      total: 0,
      daysMarked: 0,
      message: result.message,
    }
  }

  // Store every leave regardless of status — future features can use non-approved ones
  for (const leave of result.data) {
    upsertLeave({
      app_id: leave.app_id,
      user_id: leave.user_id,
      leave_type_id: leave.leave_type_id,
      leave_name: leave.leave_name,
      start_date: leave.start_date.split("T")[0],
      start_type: leave.start_type,
      end_date: leave.end_date.split("T")[0],
      end_type: leave.end_type,
      total_days: leave.total_days,
      comment: leave.comment || null,
      status: leave.status,
      is_approved_by_pm: leave.is_approved_by_pm,
      available_days: leave.available_days,
      created_at: leave.created_at,
      modified_at: leave.modified_at || null,
    })
  }

  // Only status=5 (Approved by HR) drives day_marks
  const approved = result.data.filter(
    (l) => l.status === LEAVE_STATUS.APPROVED_BY_HR
  )
  const daysMarked = applyLeavesToDayMarks()

  return {
    success: true,
    synced: approved.length,
    total: result.data.length,
    daysMarked,
  }
}
