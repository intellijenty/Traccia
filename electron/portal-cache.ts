import { getDb } from "./database"

// Dates older than this many days are considered permanent (immutable biometric data)
const PERMANENT_DAYS = 10

function getPermanentCutoff(): string {
  const d = new Date()
  d.setDate(d.getDate() - PERMANENT_DAYS)
  return d.toLocaleDateString("en-CA")
}

export function isDatePermanent(date: string): boolean {
  return date < getPermanentCutoff()
}

export interface CacheEntry {
  // Portal data stored as parsed JSON; typed as any since this is a generic storage layer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  cachedAt: string
  permanent: boolean
}

export interface CacheStatus {
  cached: boolean
  permanent: boolean
  cachedAt: string | null
}

export function getFromCache(date: string): CacheEntry | null {
  const row = getDb()
    .prepare(
      "SELECT data, cached_at, is_permanent FROM portal_cache WHERE date = ?"
    )
    .get(date) as
    | { data: string; cached_at: string; is_permanent: number }
    | undefined
  if (!row) return null
  return {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data: JSON.parse(row.data),
    cachedAt: row.cached_at,
    permanent: row.is_permanent === 1,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setToCache(date: string, data: any): void {
  const permanent = isDatePermanent(date) ? 1 : 0
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO portal_cache (date, data, cached_at, is_permanent) VALUES (?, ?, ?, ?)"
    )
    .run(date, JSON.stringify(data), new Date().toISOString(), permanent)
}

export function isCachedDate(date: string): boolean {
  return !!getDb()
    .prepare("SELECT 1 FROM portal_cache WHERE date = ?")
    .get(date)
}

export function getCacheStatus(date: string): CacheStatus {
  const row = getDb()
    .prepare("SELECT cached_at, is_permanent FROM portal_cache WHERE date = ?")
    .get(date) as { cached_at: string; is_permanent: number } | undefined
  if (!row) return { cached: false, permanent: false, cachedAt: null }
  return {
    cached: true,
    permanent: row.is_permanent === 1,
    cachedAt: row.cached_at,
  }
}

export function getNonPermanentCachedDates(): string[] {
  const rows = getDb()
    .prepare(
      "SELECT date FROM portal_cache WHERE is_permanent = 0 ORDER BY date ASC"
    )
    .all() as { date: string }[]
  return rows.map((r) => r.date)
}

export function invalidateDates(dates: string[]): void {
  const stmt = getDb().prepare("DELETE FROM portal_cache WHERE date = ?")
  for (const date of dates) stmt.run(date)
}

export function invalidateAll(): void {
  getDb().prepare("DELETE FROM portal_cache").run()
}
