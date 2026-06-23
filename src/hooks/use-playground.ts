import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PortalEntry, PunchEntry, WorkWindow } from "@/lib/types"
import {
  type DraftPunch,
  type Gate,
  type Wire,
  activePunches,
  localSessions,
  makeAddedPunch,
  nextGate,
  pairPunches,
  submittablePunches,
  unpairPortal,
  workingMinutes,
} from "@/lib/playground"

const isElectron = typeof window !== "undefined" && !!window.electronAPI

function minuteKey(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 60000)
}

function isoFromLocal(date: string, hours: number, minutes: number): string {
  const hh = String(hours).padStart(2, "0")
  const mm = String(minutes).padStart(2, "0")
  return new Date(`${date}T${hh}:${mm}:00`).toISOString()
}

interface MergeResult {
  draft: DraftPunch[]
  portalChanged: boolean
  appliedTimes: string[]
}

function mergeDraft(freshAnchors: DraftPunch[], persisted: DraftPunch[]): MergeResult {
  const persistedAnchors = persisted.filter((p) => p.origin === "anchor")
  const persistedAnchorMinutes = new Set(persistedAnchors.map((p) => minuteKey(p.time)))
  const freshAnchorMinutes = new Set(freshAnchors.map((a) => minuteKey(a.time)))

  // Gate assignments on anchors must survive the fresh-anchor rebuild.
  const persistedAnchorByMinute = new Map(persistedAnchors.map((p) => [minuteKey(p.time), p]))

  const appliedTimes: string[] = []
  const keptAdded = persisted
    .filter((p) => p.origin === "added")
    .filter((p) => {
      if (freshAnchorMinutes.has(minuteKey(p.time))) {
        appliedTimes.push(new Date(p.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }))
        return false
      }
      return true
    })

  const portalChanged =
    persistedAnchorMinutes.size !== freshAnchorMinutes.size ||
    [...freshAnchorMinutes].some((m) => !persistedAnchorMinutes.has(m))

  const mergedAnchors = freshAnchors.map((a) => {
    const prev = persistedAnchorByMinute.get(minuteKey(a.time))
    return prev?.gate ? { ...a, gate: prev.gate } : a
  })

  return { draft: [...mergedAnchors, ...keptAdded], portalChanged, appliedTimes }
}

export interface UsePlaygroundResult {
  loading: boolean
  offline: boolean
  localSessionsList: ReturnType<typeof localSessions>
  draft: DraftPunch[]
  wires: Wire[]
  notice: { portalChanged: boolean; appliedTimes: string[] } | null
  dismissNotice: () => void
  // Derived
  balanced: boolean
  danglingCount: number
  correctedMinutes: number
  submittable: DraftPunch[]
  // Local filter state
  hiddenLocalTimes: string[]
  localTimeRange: { start: string; end: string } | null
  workWindow: WorkWindow | null
  // Mutations — draft
  addPunch: (hours: number, minutes: number) => void
  editPunch: (id: string, hours: number, minutes: number) => void
  removePunch: (id: string) => void
  setReason: (id: string, reason: string) => void
  copyFromLocal: (iso: string) => void
  // Mutations — local filters
  hideLocalEvent: (time: string) => void
  setTimeRange: (range: { start: string; end: string } | null) => void
  // Mutations — reset
  reset: () => void
  resetPortal: () => void
  resetLocal: () => void
  // Mutations — wires
  addWire: (draftTime: string, localTime: string) => void
  removeWire: (draftTime: string) => void
  // Mutations — gate
  cycleGate: (id: string) => void
  setGate: (id: string, gate: Gate) => void
}

export function usePlayground(date: string): UsePlaygroundResult {
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [events, setEvents] = useState<PunchEntry[]>([])
  const [portalEntries, setPortalEntries] = useState<PortalEntry[]>([])
  const [draft, setDraft] = useState<DraftPunch[]>([])
  const [notice, setNotice] = useState<{ portalChanged: boolean; appliedTimes: string[] } | null>(null)
  const [wires, setWires] = useState<Wire[]>([])
  const [hiddenLocalTimes, setHiddenLocalTimes] = useState<string[]>([])
  const [localTimeRange, setLocalTimeRange] = useState<{ start: string; end: string } | null>(null)
  const [workWindow, setWorkWindow] = useState<WorkWindow | null>(null)

  const ready = useRef(false)

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    ready.current = false
    setLoading(true)

    async function load() {
      if (!isElectron) {
        if (!cancelled) { setLoading(false); ready.current = true }
        return
      }

      const rawEvents = await window.electronAPI.getEvents(date).catch(() => [])
      const localEvents = rawEvents.map((e) => ({
        ...e,
        trigger: e.trigger ?? (e as unknown as { trigger_label?: PunchEntry["trigger"] }).trigger_label,
      }))

      let entries: PortalEntry[] = []
      let isOffline = false
      const live = await window.electronAPI.portalGetDay(date, true).catch(() => null)
      if (live?.data?.success) {
        entries = live.data.entries
      } else {
        const cached = await window.electronAPI.portalGetDay(date, false).catch(() => null)
        if (cached?.data?.success) entries = cached.data.entries
        isOffline = true
      }

      // Work window for this date — used as time-range filter default.
      const status = await window.electronAPI.getStatus(date).catch(() => null)
      const ww = status?.workWindow ?? null

      const freshAnchors = unpairPortal(entries)

      const storedRaw = await window.electronAPI.misspunchDraftGet(date).catch(() => null)
      let nextDraft = freshAnchors
      let nextWires: Wire[] = []
      let nextHidden: string[] = []
      let nextRange: { start: string; end: string } | null = ww ? { start: ww.start, end: ww.end } : null
      let nextNotice: { portalChanged: boolean; appliedTimes: string[] } | null = null

      if (storedRaw) {
        try {
          const parsed = JSON.parse(storedRaw)
          const persisted: DraftPunch[] = Array.isArray(parsed) ? parsed : (parsed.draft ?? [])
          nextWires = Array.isArray(parsed) ? [] : (parsed.wires ?? [])

          // Load filter state — undefined means field absent (old draft) → use defaults.
          nextHidden = Array.isArray(parsed) ? [] : (parsed.hiddenLocalTimes ?? [])
          nextRange = Array.isArray(parsed)
            ? nextRange
            : parsed.localTimeRange !== undefined
              ? parsed.localTimeRange
              : nextRange

          const merged = mergeDraft(freshAnchors, persisted)
          nextDraft = merged.draft
          if (merged.portalChanged || merged.appliedTimes.length > 0) {
            nextNotice = { portalChanged: merged.portalChanged, appliedTimes: merged.appliedTimes }
          }
        } catch {
          nextDraft = freshAnchors
        }
      }

      if (cancelled) return
      setEvents(localEvents)
      setPortalEntries(entries)
      setDraft(nextDraft)
      setWires(nextWires)
      setHiddenLocalTimes(nextHidden)
      setLocalTimeRange(nextRange)
      setWorkWindow(ww)
      setOffline(isOffline)
      setNotice(nextNotice)
      setLoading(false)
      ready.current = true
    }

    load()
    return () => { cancelled = true }
  }, [date])

  // ── Persist ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!ready.current || !isElectron) return
    window.electronAPI
      .misspunchDraftSet(date, JSON.stringify({ draft, wires, hiddenLocalTimes, localTimeRange }))
      .catch(() => {})
  }, [draft, wires, hiddenLocalTimes, localTimeRange, date])

  // ── Draft mutations ───────────────────────────────────────────────────────

  const addPunch = useCallback((hours: number, minutes: number) => {
    setDraft((d) => [...d, makeAddedPunch(isoFromLocal(date, hours, minutes))])
  }, [date])

  const editPunch = useCallback((id: string, hours: number, minutes: number) => {
    const iso = isoFromLocal(date, hours, minutes)
    setDraft((d) => d.map((p) => (p.id === id ? { ...p, time: iso } : p)))
  }, [date])

  const removePunch = useCallback((id: string) => {
    setDraft((d) => d.filter((p) => !(p.id === id && p.origin === "added")))
  }, [])

  const setReason = useCallback((id: string, reason: string) => {
    setDraft((d) => d.map((p) => (p.id === id ? { ...p, reason } : p)))
  }, [])

  const copyFromLocal = useCallback((iso: string) => {
    setDraft((d) => [...d, makeAddedPunch(iso)])
  }, [])

  // ── Local filter mutations ────────────────────────────────────────────────

  const hideLocalEvent = useCallback((time: string) => {
    setHiddenLocalTimes((h) => (h.includes(time) ? h : [...h, time]))
    // Remove any wire that referenced this event.
    setWires((ws) => ws.filter((w) => w.localTime !== time))
  }, [])

  const setTimeRange = useCallback((range: { start: string; end: string } | null) => {
    setLocalTimeRange(range)
  }, [])

  // ── Reset mutations ───────────────────────────────────────────────────────

  const resetPortal = useCallback(() => {
    setDraft(unpairPortal(portalEntries))
    // Wires key off draft timestamps — re-seeding draft makes them stale.
    setWires([])
    setNotice(null)
  }, [portalEntries])

  const resetLocal = useCallback(() => {
    setHiddenLocalTimes([])
    setLocalTimeRange(workWindow ? { start: workWindow.start, end: workWindow.end } : null)
  }, [workWindow])

  const reset = useCallback(() => {
    setDraft(unpairPortal(portalEntries))
    setWires([])
    setNotice(null)
    setHiddenLocalTimes([])
    setLocalTimeRange(workWindow ? { start: workWindow.start, end: workWindow.end } : null)
  }, [portalEntries, workWindow])

  const dismissNotice = useCallback(() => setNotice(null), [])

  // ── Wire mutations ────────────────────────────────────────────────────────

  const addWire = useCallback((draftTime: string, localTime: string) => {
    setWires((ws) => {
      const filtered = ws.filter((w) => w.draftTime !== draftTime && w.localTime !== localTime)
      return [...filtered, { draftTime, localTime }]
    })
  }, [])

  const removeWire = useCallback((draftTime: string) => {
    setWires((ws) => ws.filter((w) => w.draftTime !== draftTime))
  }, [])

  const cycleGate = useCallback((id: string) => {
    setDraft((d) => d.map((p) => (p.id === id ? { ...p, gate: nextGate(p.gate ?? null) } : p)))
  }, [])

  const setGate = useCallback((id: string, gate: Gate) => {
    setDraft((d) => d.map((p) => (p.id === id ? { ...p, gate } : p)))
  }, [])

  // ── Derived ───────────────────────────────────────────────────────────────

  const { balanced, danglingCount, correctedMinutes } = useMemo(() => {
    const pair = pairPunches(activePunches(draft))
    return {
      balanced: pair.balanced,
      danglingCount: pair.danglingCount,
      correctedMinutes: workingMinutes(pair),
    }
  }, [draft])

  const submittable = useMemo(() => submittablePunches(draft), [draft])
  const localSessionsList = useMemo(() => localSessions(events), [events])

  return {
    loading,
    offline,
    localSessionsList,
    draft,
    wires,
    notice,
    dismissNotice,
    balanced,
    danglingCount,
    correctedMinutes,
    submittable,
    hiddenLocalTimes,
    localTimeRange,
    workWindow,
    addPunch,
    editPunch,
    removePunch,
    setReason,
    copyFromLocal,
    hideLocalEvent,
    setTimeRange,
    reset,
    resetPortal,
    resetLocal,
    addWire,
    removeWire,
    cycleGate,
    setGate,
  }
}
