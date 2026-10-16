/**
 * daily-sync.ts — once-per-startup background synchronisation job.
 *
 * Operations (in order):
 *   1. syncLeaves           — fetch approved leaves from portal, update day_marks
 *   2. syncNonPermanentDays — refresh non-permanent portal cache entries, promote eligible ones
 *   3. syncPeopleToday      — snapshot today's on-leave and birthday lists
 *
 * Strategy:
 *   - The last-synced date is persisted in the settings table under "lastDailySyncDate".
 *   - On app start, the job runs once (after a short boot delay) if today has not been synced yet.
 *   - Sync is skipped silently when no HRMS credentials are configured.
 *   - The date is marked as synced regardless of individual operation outcomes so persistent
 *     server failures do not cause repeated retries. The next app start will try again.
 */

import fs from "fs"
import os from "os"
import path from "path"
import ElectronStore from "electron-store"
import { syncLeaves, type LeaveSyncResult } from "./leave-sync"
import { syncNonPermanentDays, type SyncSummary } from "./portal-sync"
import { getSetting, setSetting } from "./database"
import { getHrmsConnectionStatus } from "./hrms"
import { refreshPeopleToday } from "./people-today"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DailySyncReport {
  date: string
  skipped: boolean
  skipReason?: "already_synced" | "no_credentials"
  leaves?: LeaveSyncResult
  portalDays?: SyncSummary
  peopleToday?: { success: boolean; failed: string[] }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const SETTING_KEY = "lastDailySyncDate"

function getLocalDate(): string {
  return new Date().toLocaleDateString("en-CA")
}

function getLastSyncDate(): string | null {
  return getSetting(SETTING_KEY) || null
}

function markSyncedToday(date: string): void {
  setSetting(SETTING_KEY, date)
}

function isSyncDue(): boolean {
  return getLastSyncDate() !== getLocalDate()
}

// ── Core sync operations ──────────────────────────────────────────────────────

async function syncPeopleToday(): Promise<DailySyncReport["peopleToday"]> {
  try {
    const { failed } = await refreshPeopleToday()
    return { success: failed.length === 0, failed }
  } catch (err) {
    console.error("[daily-sync] People today failed:", err)
    return { success: false, failed: ["onLeave", "birthdays"] }
  }
}

async function runSyncOperations(): Promise<
  Pick<DailySyncReport, "leaves" | "portalDays" | "peopleToday">
> {
  const leaves = await syncLeaves()
  const portalDays = await syncNonPermanentDays()
  const peopleToday = await syncPeopleToday()
  return { leaves, portalDays, peopleToday }
}

const store = new ElectronStore()

async function runEodTempCleanup(): Promise<void> {
  try {
    const now = Date.now()
    const pending: string[] =
      (store.get("pendingEodTempDirs") as string[] | undefined) || []
    const newPending: string[] = []

    // Attempt cleanup of pending dirs older than 5 minutes
    for (const dir of pending) {
      try {
        const st = fs.statSync(dir)
        const ageMs = now - st.mtimeMs

        if (ageMs >= 5 * 60 * 1000) {
          // SAFETY CHECKS
          const resolved = path.resolve(dir)
          const tmpRoot = path.resolve(os.tmpdir())
          const base = path.basename(resolved)

          const isInsideTmp = resolved.startsWith(tmpRoot)
          const hasExpectedPrefix = base.startsWith("traccia-eod-")

          if (!isInsideTmp || !hasExpectedPrefix) {
            console.warn(
              "[eod-cleanup] Refusing to delete unsafe path:",
              resolved
            )
            continue
          }

          try {
            fs.rmSync(resolved, { recursive: true, force: true })
          } catch {
            newPending.push(dir)
          }
        } else {
          newPending.push(dir)
        }
      } catch {
        // If stat fails, drop it (likely already removed)
      }
    }

    store.set("pendingEodTempDirs", newPending)

    // Scan os.tmpdir for stray EOD temp files/dirs older than 1 hour
    const tmp = os.tmpdir()
    const entries = fs.readdirSync(tmp)
    for (const e of entries) {
      const isEodDir = e.startsWith("traccia-eod-")
      const isEodEml = e.startsWith("eod-draft-") && e.endsWith(".eml")
      if (!isEodDir && !isEodEml) continue
      const full = path.join(tmp, e)
      try {
        const st = fs.statSync(full)
        if (now - st.mtimeMs >= 60 * 60 * 1000) {
          try {
            fs.rmSync(full, { recursive: true, force: true })
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.error("[eod-cleanup] Unexpected error during cleanup:", err)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the daily sync. Skips when already synced today or when no credentials
 * are configured. Pass force=true to bypass the "already synced" guard (e.g.
 * from a manual UI trigger).
 */
export async function runDailySync(force = false): Promise<DailySyncReport> {
  const today = getLocalDate()

  if (!force && !isSyncDue()) {
    console.log(`[daily-sync] Already synced today (${today}), skipping`)
    return { date: today, skipped: true, skipReason: "already_synced" }
  }

  runEodTempCleanup().catch((err) =>
    console.error("[eod-cleanup] Failed:", err)
  )

  if (!getHrmsConnectionStatus().hasCredentials) {
    console.log("[daily-sync] No HRMS credentials configured, skipping")
    return { date: today, skipped: true, skipReason: "no_credentials" }
  }

  console.log(`[daily-sync] Starting daily sync for ${today}`)

  const results = await runSyncOperations()

  markSyncedToday(today)

  console.log(
    `[daily-sync] Done - leaves: ${results.leaves?.success ? `${results.leaves.synced} synced, ${results.leaves.daysMarked} days marked` : `failed (${results.leaves?.message})`}` +
      ` | portal: ${results.portalDays?.synced} synced, ${results.portalDays?.promoted} promoted, ${results.portalDays?.failed} failed`
  )

  return { date: today, skipped: false, ...results }
}

// ── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Schedule a one-time startup sync. Runs once after a short boot delay so the
 * app and renderer finish initialising before any network calls begin.
 * Call once from app.whenReady().
 *
 * @param onComplete Called when a sync actually ran (not when skipped). Use this
 *                   to notify the renderer of data changes (e.g. updated day_marks).
 */
export function scheduleDailySync(onComplete?: () => void): void {
  setTimeout(() => {
    runDailySync()
      .then((report) => {
        if (!report.skipped) onComplete?.()
      })
      .catch((err) => console.error("[daily-sync] Unexpected error:", err))
  }, 5000)
}
