import { useEffect, useMemo } from "react"
import { usePortalStoreContext } from "@/contexts/portal-store"
import type { WeekDaySummary } from "@/lib/types"

const REFRESH_INTERVAL_MS = 5 * 60 * 1000

function getLocalDate(): string {
  return new Date().toLocaleDateString("en-CA")
}

function portalDataToSummary(
  date: string,
  data: {
    entries: Array<{
      outtime: string | null
      workingmins: number | null
      intime: string
    }>
    totalMinutes: number
    isCurrentlyIn: boolean
  }
): WeekDaySummary {
  const today = getLocalDate()
  const openEntries = data.entries.filter((e) => e.outtime === null).length
  // Entries with null outtime on past dates = misspunch; on today = active session (not a misspunch)
  const missPunchCount =
    data.isCurrentlyIn && date === today
      ? Math.max(0, openEntries - 1)
      : openEntries

  return {
    date,
    totalSeconds: data.totalMinutes * 60,
    eventCount: data.entries.length,
    missPunchCount,
  }
}

interface UsePortalRangeResult {
  summaries: WeekDaySummary[]
  loading: boolean
}

/**
 * Thin selector hook for a range of portal days (week / month).
 * Reads from PortalStoreContext and triggers batch fetch when needed.
 */
export function usePortalRange(dates: string[]): UsePortalRangeResult {
  const store = usePortalStoreContext()
  const today = getLocalDate()
  const validDates = dates.filter((d) => d <= today)
  const rangeIncludesToday = validDates.includes(today)
  const datesKey = dates.join(",")
  const validDatesKey = validDates.join(",")

  // Trigger initial load and set up 5-min refresh if range includes today (future dates excluded)
  useEffect(() => {
    if (!store.connected || validDates.length === 0) return
    store.refreshRange(validDates)
  }, [validDatesKey, store.connected]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!store.connected || !rangeIncludesToday || validDates.length === 0)
      return
    const id = setInterval(
      () => store.refreshRange(validDates),
      REFRESH_INTERVAL_MS
    )
    return () => clearInterval(id)
  }, [validDatesKey, rangeIncludesToday, store.connected]) // eslint-disable-line react-hooks/exhaustive-deps

  const summaries = useMemo<WeekDaySummary[]>(() => {
    return dates
      .map((date) => {
        const entry = store.cache[date]
        if (!entry?.data?.success) return null
        return portalDataToSummary(date, entry.data)
      })
      .filter((s): s is WeekDaySummary => s !== null)
  }, [datesKey, store.cache]) // eslint-disable-line react-hooks/exhaustive-deps

  const loading = dates.some((d) => !store.cache[d] && store.syncing.has(d))

  return { summaries, loading }
}
