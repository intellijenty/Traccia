import { useEffect, useMemo } from "react"
import { usePortalStoreContext } from "@/contexts/portal-store"
import type { HrmsConnectionStatus, PortalData } from "@/lib/types"

const REFRESH_INTERVAL_MS = 5 * 60 * 1000

function getLocalDate(): string {
  return new Date().toLocaleDateString("en-CA")
}

interface UsePortalDayResult {
  portalData: PortalData | null
  hrmsStatus: HrmsConnectionStatus
  loading: boolean
  syncing: boolean
  error: string | null
  permanent: boolean
  lastRefreshed: Date | null
  login: (
    email: string,
    password: string,
    baseUrl?: string
  ) => Promise<{ success: boolean; message?: string }>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

/**
 * Thin selector hook for a single portal day.
 * Reads from PortalStoreContext and triggers fetch when needed.
 */
export function usePortalDay(date?: string): UsePortalDayResult {
  const store = usePortalStoreContext()
  const targetDate = date ?? getLocalDate()
  const isToday = targetDate === getLocalDate()

  const isFuture = targetDate > getLocalDate()

  // Trigger initial load and set up 5-min refresh (skip future dates)
  useEffect(() => {
    if (!store.connected || isFuture) return
    store.refreshDay(targetDate)
  }, [targetDate, store.connected, isFuture]) // oxlint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!store.connected || !isToday || isFuture) return
    const id = setInterval(
      () => store.refreshDay(targetDate),
      REFRESH_INTERVAL_MS
    )
    return () => clearInterval(id)
  }, [targetDate, isToday, store.connected, isFuture]) // oxlint-disable-line react-hooks/exhaustive-deps

  const entry = store.cache[targetDate]

  // For today's active session: derive live minutes from lastInTime + liveTick
  const portalData = useMemo<PortalData | null>(() => {
    if (!entry?.data) return null
    const data = entry.data
    if (!isToday || !data.isCurrentlyIn || !data.lastInTime) return data

    const activeSessionMinutes = Math.max(
      0,
      Math.floor((Date.now() - new Date(data.lastInTime).getTime()) / 60000)
    )
    const diff = activeSessionMinutes - data.activeSessionMinutes
    if (diff <= 0) return data
    return {
      ...data,
      activeSessionMinutes,
      totalMinutes: data.totalMinutes + diff,
    }
  }, [entry, isToday, store.liveTick]) // oxlint-disable-line react-hooks/exhaustive-deps

  const isSyncing = store.syncing.has(targetDate)
  const hasData = !!entry

  return {
    portalData,
    hrmsStatus: store.status,
    loading: !hasData && isSyncing,
    syncing: hasData && isSyncing,
    error: store.errors[targetDate] ?? null,
    permanent: entry?.permanent ?? false,
    lastRefreshed: entry ? new Date(entry.cachedAt) : null,
    login: store.login,
    logout: store.logout,
    refresh: () => store.refreshDay(targetDate, true),
  }
}
