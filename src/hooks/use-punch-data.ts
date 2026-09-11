import { useState, useEffect, useCallback, useRef } from "react"
import { toast } from "sonner"
import type {
  PunchEntry,
  PunchStatus,
  EntryType,
  WorkWindow,
} from "@/lib/types"

function getErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback
  // Electron wraps IPC errors: "Error invoking remote method 'X': Error: ACTUAL"
  const match = err.message.match(
    /Error invoking remote method '[^']+': Error: (.+)/
  )
  return match ? match[1] : err.message
}

const isElectron = typeof window !== "undefined" && !!window.electronAPI

function isTimeInWorkWindow(now: Date, window: WorkWindow | null): boolean {
  if (!window) return true // no window = count everything
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  if (window.start <= window.end) {
    // Normal: e.g. 09:00–21:30
    return hhmm >= window.start && hhmm < window.end
  }
  // Wrapped: e.g. 22:00–06:00 → valid if >= start OR < end
  return hhmm >= window.start || hhmm < window.end
}

function getLocalDate(): string {
  return new Date().toLocaleDateString("en-CA") // YYYY-MM-DD
}

// ── Mock store for development outside Electron ──

let mockNextId = 6
let mockEntries: PunchEntry[] = []
let mockInitialized = false

function initMockEntries(): void {
  if (mockInitialized) return
  mockInitialized = true

  const base = new Date()
  base.setHours(9, 0, 0, 0)
  const now = new Date().toISOString()

  mockEntries = [
    {
      id: 5,
      timestamp: new Date(base.getTime() + 6 * 3600000).toISOString(),
      date: getLocalDate(),
      type: "LOGIN",
      source: "auto",
      trigger: "via unlock",
      notes: null,
      created_at: now,
      modified_at: null,
    },
    {
      id: 4,
      timestamp: new Date(base.getTime() + 5 * 3600000).toISOString(),
      date: getLocalDate(),
      type: "LOGOUT",
      source: "auto",
      trigger: "via lock",
      notes: null,
      created_at: now,
      modified_at: null,
    },
    {
      id: 3,
      timestamp: new Date(base.getTime() + 3 * 3600000).toISOString(),
      date: getLocalDate(),
      type: "LOGIN",
      source: "auto",
      trigger: "via unlock",
      notes: null,
      created_at: now,
      modified_at: null,
    },
    {
      id: 2,
      timestamp: new Date(base.getTime() + 1 * 3600000).toISOString(),
      date: getLocalDate(),
      type: "LOGOUT",
      source: "auto",
      trigger: "via lock",
      notes: null,
      created_at: now,
      modified_at: null,
    },
    {
      id: 1,
      timestamp: base.toISOString(),
      date: getLocalDate(),
      type: "LOGIN",
      source: "auto",
      trigger: "via boot",
      notes: null,
      created_at: now,
      modified_at: null,
    },
  ]
}

function getMockEntriesByDate(date: string): PunchEntry[] {
  initMockEntries()
  return mockEntries
    .filter((e) => e.date === date)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

function getMockStatus(): PunchStatus {
  initMockEntries()
  const today = getLocalDate()
  const todayEntries = mockEntries
    .filter((e) => e.date === today)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  const last = todayEntries[todayEntries.length - 1] || null
  const isIn = last?.type === "LOGIN"

  let totalSeconds = 0
  let loginTime: number | null = null
  for (const entry of todayEntries) {
    if (entry.type === "LOGIN") {
      loginTime = new Date(entry.timestamp).getTime()
    } else if (entry.type === "LOGOUT" && loginTime !== null) {
      totalSeconds += (new Date(entry.timestamp).getTime() - loginTime) / 1000
      loginTime = null
    }
  }
  if (loginTime !== null) {
    totalSeconds += (Date.now() - loginTime) / 1000
  }

  return {
    isIn,
    lastEntry: last,
    totalSecondsToday: Math.max(0, Math.floor(totalSeconds)),
    workingSecondsToday: Math.max(0, Math.floor(totalSeconds)),
    eventCount: todayEntries.length,
    workWindow: null,
    workMode: "all" as const,
  }
}

function mockAddEntry(data: {
  date: string
  time: string
  type: EntryType
  notes?: string
}): void {
  initMockEntries()
  const timestamp = new Date(`${data.date}T${data.time}`).toISOString()
  mockEntries.push({
    id: mockNextId++,
    timestamp,
    date: data.date,
    type: data.type,
    source: "manual",
    trigger: "via manual",
    notes: data.notes || null,
    created_at: new Date().toISOString(),
    modified_at: null,
  })
}

function mockDeleteEntry(id: number): void {
  initMockEntries()
  mockEntries = mockEntries.filter((e) => e.id !== id)
}

function mockEditEntry(id: number, updates: { timestamp?: string }): void {
  initMockEntries()
  mockEntries = mockEntries.map((e) =>
    e.id === id
      ? {
          ...e,
          ...(updates.timestamp ? { timestamp: updates.timestamp } : {}),
          modified_at: new Date().toISOString(),
        }
      : e
  )
}

function mockPunch(type: EntryType): void {
  initMockEntries()
  const now = new Date()
  mockEntries.push({
    id: mockNextId++,
    timestamp: now.toISOString(),
    date: getLocalDate(),
    type,
    source: "manual",
    trigger: "via manual",
    notes: null,
    created_at: now.toISOString(),
    modified_at: null,
  })
}

// ── Hook ──

export function usePunchData(date?: string) {
  const targetDate = date || getLocalDate()
  const isToday = targetDate === getLocalDate()

  const [status, setStatus] = useState<PunchStatus | null>(null)
  const [events, setEvents] = useState<PunchEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const snapshotRef = useRef<{
    total: number
    working: number
    at: number
  } | null>(null)
  const workTicksRef = useRef(0)

  const refresh = useCallback(async () => {
    try {
      if (isElectron) {
        const [newStatus, newEvents] = await Promise.all([
          window.electronAPI.getStatus(targetDate),
          window.electronAPI.getEvents(targetDate),
        ])
        setStatus(newStatus)
        setEvents(newEvents)
        if (newStatus.isIn) {
          snapshotRef.current = {
            total: newStatus.totalSecondsToday,
            working: newStatus.workingSecondsToday,
            at: Date.now(),
          }
          workTicksRef.current = 0
        }
      } else {
        const mockStatus = getMockStatus()
        setStatus(mockStatus)
        setEvents(getMockEntriesByDate(targetDate))
        if (mockStatus.isIn) {
          snapshotRef.current = {
            total: mockStatus.totalSecondsToday,
            working: mockStatus.workingSecondsToday,
            at: Date.now(),
          }
          workTicksRef.current = 0
        }
      }
      setLastUpdated(new Date())
    } catch (err) {
      console.error("Failed to fetch punch data:", err)
    } finally {
      setLoading(false)
    }
  }, [targetDate])

  // Re-fetch when date changes
  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  // Listen for IPC updates from main process
  useEffect(() => {
    if (!isElectron) return
    const unsubscribe = window.electronAPI.onEventUpdate(() => {
      refresh()
    })
    return unsubscribe
  }, [refresh])

  // Refresh local data on window focus (today only, throttled 60s)
  useEffect(() => {
    if (!isToday) return
    let lastFocusRefresh = 0
    const THROTTLE_MS = 60_000
    const handleFocus = () => {
      const now = Date.now()
      if (now - lastFocusRefresh < THROTTLE_MS) return
      lastFocusRefresh = now
      refresh()
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [isToday, refresh])

  // Live timer: only tick when viewing today and punched in
  useEffect(() => {
    if (!isToday || !status?.isIn) return
    timerRef.current = setInterval(() => {
      setStatus((prev) => {
        if (!prev || !prev.isIn) return prev
        const snap = snapshotRef.current
        if (!snap) return prev
        const elapsed = Math.floor((Date.now() - snap.at) / 1000)
        const workIncrement =
          prev.workMode === "holiday"
            ? 0
            : prev.workMode === "all"
              ? 1
              : isTimeInWorkWindow(new Date(), prev.workWindow)
                ? 1
                : 0
        workTicksRef.current += workIncrement
        return {
          ...prev,
          totalSecondsToday: snap.total + elapsed,
          workingSecondsToday: snap.working + workTicksRef.current,
        }
      })
    }, 1000)
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isToday, status?.isIn])

  const punchIn = useCallback(async () => {
    try {
      if (isElectron) await window.electronAPI.punchIn()
      else mockPunch("LOGIN")
    } catch (err) {
      toast.error(getErrorMessage(err, "Punch in failed"))
      throw err
    }
    await refresh()
  }, [refresh])

  const punchOut = useCallback(async () => {
    try {
      if (isElectron) await window.electronAPI.punchOut()
      else mockPunch("LOGOUT")
    } catch (err) {
      toast.error(getErrorMessage(err, "Punch out failed"))
      throw err
    }
    await refresh()
  }, [refresh])

  const addEntry = useCallback(
    async (data: {
      date: string
      time: string
      type: "LOGIN" | "LOGOUT"
      notes?: string
    }) => {
      try {
        if (isElectron) await window.electronAPI.addEntry(data)
        else mockAddEntry(data)
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to add entry"))
        throw err
      }
      await refresh()
    },
    [refresh]
  )

  const editEntry = useCallback(
    async (id: number, updates: { timestamp?: string; notes?: string }) => {
      try {
        if (isElectron) await window.electronAPI.editEntry(id, updates)
        else mockEditEntry(id, updates)
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to edit entry"))
        throw err
      }
      await refresh()
    },
    [refresh]
  )

  const deleteEntry = useCallback(
    async (id: number) => {
      try {
        if (isElectron) await window.electronAPI.deleteEntry(id)
        else mockDeleteEntry(id)
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to delete entry"))
        throw err
      }
      await refresh()
    },
    [refresh]
  )

  const deletePair = useCallback(
    async (id1: number, id2: number) => {
      try {
        if (isElectron) await window.electronAPI.deleteEntries([id1, id2])
        else {
          mockDeleteEntry(id1)
          mockDeleteEntry(id2)
        }
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to delete entries"))
        throw err
      }
      await refresh()
    },
    [refresh]
  )

  const addEntryPair = useCallback(
    async (data: { date: string; time1: string; time2: string }) => {
      try {
        if (isElectron) {
          await window.electronAPI.addEntryPair(data)
        } else {
          // In mock, insert in chronological order — types don't matter for mock display
          const [first, second] = [data.time1, data.time2].sort()
          mockAddEntry({ date: data.date, time: first, type: "LOGOUT" })
          mockAddEntry({ date: data.date, time: second, type: "LOGIN" })
        }
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to add pair"))
        throw err
      }
      await refresh()
    },
    [refresh]
  )

  return {
    status,
    events,
    loading,
    lastUpdated,
    isToday,
    punchIn,
    punchOut,
    addEntry,
    editEntry,
    deleteEntry,
    deletePair,
    addEntryPair,
    refresh,
  }
}
