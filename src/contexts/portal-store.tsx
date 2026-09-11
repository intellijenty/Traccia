import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import type {
  HrmsConnectionStatus,
  PortalData,
  PortalRangeResult,
} from "@/lib/types"

const isElectron = typeof window !== "undefined" && !!window.electronAPI

// ── Mock helpers ──────────────────────────────────────────────────────────────

function getMockPortalData(date: string): PortalData {
  const base = new Date(`${date}T09:00:00`)
  const isToday = date === new Date().toLocaleDateString("en-CA")

  const activeInTime = new Date(base.getTime() + 2.5 * 3600000)
  const activeMinutes = isToday
    ? Math.max(0, Math.floor((Date.now() - activeInTime.getTime()) / 60000))
    : 0

  return {
    success: true,
    entries: [
      {
        empid: 132,
        logdate: base.toISOString(),
        intime: base.toISOString(),
        outtime: new Date(base.getTime() + 21 * 60000).toISOString(),
        workingmins: 21,
        ismanual: 0,
      },
      {
        empid: 132,
        logdate: base.toISOString(),
        intime: new Date(base.getTime() + 24 * 60000).toISOString(),
        outtime: new Date(base.getTime() + 2 * 3600000).toISOString(),
        workingmins: 96,
        ismanual: 0,
      },
      ...(isToday
        ? [
            {
              empid: 132,
              logdate: base.toISOString(),
              intime: activeInTime.toISOString(),
              outtime: null,
              workingmins: null,
              ismanual: 0,
            },
          ]
        : []),
    ],
    totalMinutes: 117 + activeMinutes,
    isCurrentlyIn: isToday,
    lastInTime: isToday ? activeInTime.toISOString() : null,
    activeSessionMinutes: activeMinutes,
  }
}

function getMockHrmsStatus(): HrmsConnectionStatus {
  return {
    connected: true,
    userName: "John Doe",
    userId: 132,
    hasCredentials: true,
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DayCacheEntry {
  data: PortalData
  cachedAt: string
  permanent: boolean
}

interface PortalStoreContextType {
  status: HrmsConnectionStatus
  cache: Record<string, DayCacheEntry>
  /** Set of dates currently being fetched */
  syncing: ReadonlySet<string>
  /** Per-date fetch errors */
  errors: Record<string, string>
  /** Increments every minute — lets hooks derive live active-session minutes */
  liveTick: number
  /** True if connected or has stored credentials */
  connected: boolean

  refreshDay: (date: string, force?: boolean) => Promise<void>
  refreshRange: (dates: string[], force?: boolean) => Promise<void>
  login: (
    email: string,
    password: string,
    baseUrl?: string
  ) => Promise<{ success: boolean; message?: string }>
  logout: () => Promise<void>
  invalidateDay: (date: string) => Promise<void>
  invalidateAll: () => Promise<void>
  populateDates: (dates: string[]) => Promise<void>
}

const PortalStoreContext = createContext<PortalStoreContextType | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

const THROTTLE_MS = 60_000

export function PortalStoreProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [status, setStatus] = useState<HrmsConnectionStatus>({
    connected: false,
    userName: null,
    userId: null,
    hasCredentials: false,
  })
  const [cache, setCache] = useState<Record<string, DayCacheEntry>>({})
  const [syncing, setSyncing] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [liveTick, setLiveTick] = useState(0)

  const syncingRef = useRef<Set<string>>(new Set())
  const cacheRef = useRef<Record<string, DayCacheEntry>>(cache)
  const statusRef = useRef(status)
  const lastGlobalRefreshRef = useRef<number>(0)

  // Keep refs in sync with latest state (no stale closures in callbacks)
  cacheRef.current = cache
  statusRef.current = status

  const connected = status.connected || status.hasCredentials

  // ── Status fetch ──

  const fetchStatus = useCallback(async (): Promise<HrmsConnectionStatus> => {
    if (!isElectron) {
      const s = getMockHrmsStatus()
      setStatus(s)
      return s
    }
    const s = await window.electronAPI.hrmsGetStatus()
    setStatus(s)
    return s
  }, [])

  // Stable ref so refreshDay/refreshRange can call fetchStatus without it
  // appearing in their dependency arrays (they use refs only — stable, no resubscribes)
  const fetchStatusRef = useRef(fetchStatus)
  fetchStatusRef.current = fetchStatus

  // ── Core: fetch + cache a single date ──

  const refreshDay = useCallback(
    async (date: string, force = false): Promise<void> => {
      const today = new Date().toLocaleDateString("en-CA")

      // Reject future dates — portal has no data for them
      if (date > today) return

      // Skip if already syncing this date
      if (syncingRef.current.has(date)) return

      const existing = cacheRef.current[date]

      // Skip permanent cached dates unless forced
      if (!force && existing?.permanent) return

      // Skip past dates already in React memory — SQLite would return the same
      // data and the API doesn't need to be hit. Today is always re-fetched
      // (never SQLite-cached; IPC always hits the API for it).
      if (!force && date !== today && existing) return

      syncingRef.current.add(date)
      setSyncing(new Set(syncingRef.current))

      try {
        let result: {
          data: PortalData | null
          fromCache: boolean
          permanent: boolean
          error?: string
        }

        if (!isElectron) {
          result = {
            data: getMockPortalData(date),
            fromCache: false,
            permanent: false,
          }
        } else {
          result = await window.electronAPI.portalGetDay(date, force)
        }

        if (result.data) {
          const entry: DayCacheEntry = {
            data: result.data,
            cachedAt: new Date().toISOString(),
            permanent: result.permanent,
          }
          setCache((prev) => ({ ...prev, [date]: entry }))
          setErrors((prev) => {
            const next = { ...prev }
            delete next[date]
            return next
          })
          // If the main process just auto-logged in (token was null before this
          // fetch), sync status so the renderer reflects connected=true and userName
          if (!statusRef.current.connected) {
            fetchStatusRef.current()
          }
        } else if (result.error) {
          setErrors((prev) => ({ ...prev, [date]: result.error! }))
        }
      } catch (err) {
        setErrors((prev) => ({
          ...prev,
          [date]: err instanceof Error ? err.message : "Failed to fetch",
        }))
      } finally {
        syncingRef.current.delete(date)
        setSyncing(new Set(syncingRef.current))
      }
    },
    [] // uses refs only — stable, no stale closure risk
  )

  // ── Fetch multiple dates in parallel ──

  const refreshRange = useCallback(
    async (dates: string[], force = false): Promise<void> => {
      const today = new Date().toLocaleDateString("en-CA")

      // Filter to dates that actually need fetching (exclude future dates)
      const toFetch = dates.filter((d) => {
        if (d > today) return false
        if (syncingRef.current.has(d)) return false
        if (!force && cacheRef.current[d]?.permanent) return false
        // Skip past dates already in React memory (same reasoning as refreshDay)
        if (!force && d !== today && cacheRef.current[d]) return false
        return true
      })
      if (toFetch.length === 0) return

      for (const d of toFetch) syncingRef.current.add(d)
      setSyncing(new Set(syncingRef.current))

      try {
        let results: PortalRangeResult[]

        if (!isElectron) {
          results = toFetch.map((date) => ({
            date,
            data: getMockPortalData(date),
            fromCache: false,
            permanent: false,
          }))
        } else {
          results = await window.electronAPI.portalGetRange(toFetch, force)
        }

        setCache((prev) => {
          const next = { ...prev }
          for (const r of results) {
            if (r.data) {
              next[r.date] = {
                data: r.data,
                cachedAt: new Date().toISOString(),
                permanent: r.permanent,
              }
            }
          }
          return next
        })

        setErrors((prev) => {
          const next = { ...prev }
          for (const r of results) {
            if (r.data) {
              delete next[r.date]
            } else if (r.error) {
              next[r.date] = r.error
            }
          }
          return next
        })

        // Sync status if any fetch succeeded while we weren't marked connected
        // (covers the transparent auto-login inside hrmsGetWorkingHours)
        const anySuccess = results.some((r) => r.data)
        if (anySuccess && !statusRef.current.connected) {
          fetchStatusRef.current()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to fetch"
        setErrors((prev) => {
          const next = { ...prev }
          for (const d of toFetch) next[d] = msg
          return next
        })
      } finally {
        for (const d of toFetch) syncingRef.current.delete(d)
        setSyncing(new Set(syncingRef.current))
      }
    },
    [] // uses refs only — stable, no stale closure risk
  )

  // ── Auth ──

  const login = useCallback(
    async (
      email: string,
      password: string,
      baseUrl?: string
    ): Promise<{ success: boolean; message?: string }> => {
      if (!isElectron) {
        setStatus(getMockHrmsStatus())
        return { success: true }
      }
      const result = await window.electronAPI.hrmsLogin(
        email,
        password,
        baseUrl
      )
      if (result.success) {
        await fetchStatus()
      }
      return result
    },
    [fetchStatus]
  )

  const logout = useCallback(async () => {
    if (isElectron) await window.electronAPI.hrmsLogout()
    setStatus({
      connected: false,
      userName: null,
      userId: null,
      hasCredentials: false,
    })
    setCache({})
    setErrors({})
  }, [])

  // ── Cache invalidation ──

  const invalidateDay = useCallback(async (date: string) => {
    if (isElectron) await window.electronAPI.portalInvalidate([date])
    setCache((prev) => {
      const next = { ...prev }
      delete next[date]
      return next
    })
  }, [])

  const invalidateAll = useCallback(async () => {
    if (isElectron) await window.electronAPI.portalInvalidateAll()
    setCache({})
  }, [])

  const populateDates = useCallback(
    async (dates: string[]) => {
      await refreshRange(dates, true)
    },
    [refreshRange]
  )

  // ── Lifecycle ──

  // Initial: fetch status on mount
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Live minute tick — drives active-session live updates in hooks
  useEffect(() => {
    const id = setInterval(() => setLiveTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // Focus / visibility: throttled refresh of today's live data.
  // Today is never SQLite-cached, so this always hits the API — giving fresh data
  // when the user returns to the app. Past dates stay as-is (SQLite is the source
  // of truth for them; re-fetching would return identical data).
  useEffect(() => {
    const handleFocus = () => {
      if (!connected) return
      const now = Date.now()
      if (now - lastGlobalRefreshRef.current < THROTTLE_MS) return
      lastGlobalRefreshRef.current = now

      const today = new Date().toLocaleDateString("en-CA")
      refreshRange([today], false)
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [connected, refreshRange])

  return (
    <PortalStoreContext.Provider
      value={{
        status,
        cache,
        syncing,
        errors,
        liveTick,
        connected,
        refreshDay,
        refreshRange,
        login,
        logout,
        invalidateDay,
        invalidateAll,
        populateDates,
      }}
    >
      {children}
    </PortalStoreContext.Provider>
  )
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePortalStoreContext(): PortalStoreContextType {
  const ctx = useContext(PortalStoreContext)
  if (!ctx)
    throw new Error(
      "usePortalStoreContext must be used inside PortalStoreProvider"
    )
  return ctx
}
