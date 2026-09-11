import { hrmsGetWorkingHours } from "./hrms"
import {
  getNonPermanentCachedDates,
  setToCache,
  isDatePermanent,
} from "./portal-cache"

export interface DaySyncResult {
  date: string
  success: boolean
  /** True if this date crossed the permanence threshold and was locked as immutable */
  promoted: boolean
  error?: string
}

export interface SyncSummary {
  results: DaySyncResult[]
  synced: number
  promoted: number
  failed: number
}

/**
 * Re-fetches every non-permanent cached day from the HRMS portal and writes
 * updated data back to SQLite. Any date that is now ≥10 days old is
 * automatically promoted to permanent (immutable) by setToCache.
 *
 * Runs sequentially to avoid hammering the API. Safe to call from a daily
 * scheduled job, on demand from the UI, or at app startup.
 */
export async function syncNonPermanentDays(): Promise<SyncSummary> {
  const today = new Date().toLocaleDateString("en-CA")
  // Today is never stored in SQLite — exclude it even if somehow present
  const dates = getNonPermanentCachedDates().filter((d) => d !== today)

  console.log(
    `[portal-sync] Starting sync for ${dates.length} non-permanent date(s): ${dates.join(", ") || "none"}`
  )

  const results: DaySyncResult[] = []

  for (const date of dates) {
    const apiDate = `${date}T00:00:00.000Z`
    try {
      const data = await hrmsGetWorkingHours(apiDate)
      if (data.success) {
        // Check eligibility before writing — setToCache will set is_permanent accordingly
        const willBePromoted = isDatePermanent(date)
        setToCache(date, data)
        results.push({ date, success: true, promoted: willBePromoted })
      } else {
        results.push({
          date,
          success: false,
          promoted: false,
          error: data.message,
        })
      }
    } catch (err) {
      results.push({
        date,
        success: false,
        promoted: false,
        error: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  const synced = results.filter((r) => r.success).length
  const promoted = results.filter((r) => r.promoted).length
  const failed = results.filter((r) => !r.success).length

  console.log(
    `[portal-sync] Done - synced: ${synced}, promoted: ${promoted}, failed: ${failed}`
  )
  if (failed > 0) {
    const errors = results
      .filter((r) => !r.success)
      .map((r) => `${r.date}: ${r.error}`)
    console.warn(`[portal-sync] Failures:\n${errors.join("\n")}`)
  }

  return { results, synced, promoted, failed }
}
