import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PortalEntry, PunchEntry } from "@/lib/types"
import {
  type DraftPunch,
  type Wire,
  activePunches,
  localSessions,
  makeAddedPunch,
  pairPunches,
  submittablePunches,
  unpairPortal,
  workingMinutes,
} from "@/lib/playground"

const isElectron = typeof window !== "undefined" && !!window.electronAPI

/** Truncate an ISO timestamp to whole minutes (portal precision) for matching. */
function minuteKey(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 60000)
}

/** Build an ISO-8601 UTC timestamp from a local YYYY-MM-DD + hour/minute. */
function isoFromLocal(date: string, hours: number, minutes: number): string {
  const hh = String(hours).padStart(2, "0")
  const mm = String(minutes).padStart(2, "0")
  return new Date(`${date}T${hh}:${mm}:00`).toISOString()
}

interface MergeResult {
  draft: DraftPunch[]
  /** True if portal changed since the persisted draft was last saved. */
  portalChanged: boolean
  /** Times (clock strings) of added punches that the portal has since adopted. */
  appliedTimes: string[]
}

/**
 * Provenance merge (design Q14): fresh portal anchors always win for the anchor
 * set; the user's hand-added punches survive; an added punch the portal now
 * contains collapses into the anchor (it got approved).
 */
function mergeDraft(freshAnchors: DraftPunch[], persisted: DraftPunch[]): MergeResult {
  const persistedAnchorMinutes = new Set(
    persisted.filter((p) => p.origin === "anchor").map((p) => minuteKey(p.time))
  )
  const freshAnchorMinutes = new Set(freshAnchors.map((a) => minuteKey(a.time)))

  // Keep added punches the portal hasn't adopted; collapse the rest.
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

  // Portal changed if anchor minute-sets differ.
  const portalChanged =
    persistedAnchorMinutes.size !== freshAnchorMinutes.size ||
    [...freshAnchorMinutes].some((m) => !persistedAnchorMinutes.has(m))

  return { draft: [...freshAnchors, ...keptAdded], portalChanged, appliedTimes }
}

export interface UsePlaygroundResult {
  loading: boolean
  /** Portal fetch failed and we fell back to (or have no) cache. */
  offline: boolean
  /** Local evidence sessions for the rail. */
  localSessionsList: ReturnType<typeof localSessions>
  /** The editable draft. */
  draft: DraftPunch[]
  /** Evidence wires: draft punch time → local event time. */
  wires: Wire[]
  /** Banner: portal changed under a persisted draft / adds got applied. */
  notice: { portalChanged: boolean; appliedTimes: string[] } | null
  dismissNotice: () => void
  // Derived
  balanced: boolean
  danglingCount: number
  correctedMinutes: number
  submittable: DraftPunch[]
  // Mutations
  addPunch: (hours: number, minutes: number) => void
  editPunch: (id: string, hours: number, minutes: number) => void
  removePunch: (id: string) => void
  setReason: (id: string, reason: string) => void
  copyFromLocal: (iso: string) => void
  reset: () => void
  addWire: (draftTime: string, localTime: string) => void
  removeWire: (draftTime: string) => void
}

/**
 * Owns one day's miss-punch reconciliation: loads local + (live) portal data,
 * seeds/merges a persisted draft, exposes edit operations, and persists every
 * change to SQLite keyed by date.
 */
export function usePlayground(date: string): UsePlaygroundResult {
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [events, setEvents] = useState<PunchEntry[]>([])
  const [portalEntries, setPortalEntries] = useState<PortalEntry[]>([])
  const [draft, setDraft] = useState<DraftPunch[]>([])
  const [notice, setNotice] = useState<{ portalChanged: boolean; appliedTimes: string[] } | null>(null)
  const [wires, setWires] = useState<Wire[]>([])

  // Avoid persisting while we're still loading the initial state.
  const ready = useRef(false)

  // ── Load: local events + live portal, then seed/merge draft ──
  useEffect(() => {
    let cancelled = false
    ready.current = false
    setLoading(true)

    async function load() {
      if (!isElectron) {
        if (!cancelled) { setLoading(false); ready.current = true }
        return
      }

      // DB returns `trigger_label` un-aliased; map onto `trigger` for localSessions().
      const rawEvents = await window.electronAPI.getEvents(date).catch(() => [])
      const localEvents = rawEvents.map((e) => ({
        ...e,
        trigger: e.trigger ?? (e as unknown as { trigger_label?: PunchEntry["trigger"] }).trigger_label,
      }))

      // Live portal (force), fall back to cache on failure.
      let entries: PortalEntry[] = []
      let isOffline = false
      const live = await window.electronAPI.portalGetDay(date, true).catch(() => null)
      if (live?.data?.success) {
        entries = live.data.entries
      } else {
        const cached = await window.electronAPI.portalGetDay(date, false).catch(() => null)
        if (cached?.data?.success) {
          entries = cached.data.entries
        }
        isOffline = true
      }

      const freshAnchors = unpairPortal(entries)

      // Persisted draft?
      const storedRaw = await window.electronAPI.misspunchDraftGet(date).catch(() => null)
      let nextDraft = freshAnchors
      let nextWires: Wire[] = []
      let nextNotice: { portalChanged: boolean; appliedTimes: string[] } | null = null

      if (storedRaw) {
        try {
          const parsed = JSON.parse(storedRaw)
          const persisted: DraftPunch[] = Array.isArray(parsed) ? parsed : (parsed.draft ?? [])
          nextWires = Array.isArray(parsed) ? [] : (parsed.wires ?? [])
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
      setOffline(isOffline)
      setNotice(nextNotice)
      setLoading(false)
      ready.current = true
    }

    load()
    return () => { cancelled = true }
  }, [date])

  // ── Persist on every draft change (after initial load) ──
  useEffect(() => {
    if (!ready.current || !isElectron) return
    window.electronAPI.misspunchDraftSet(date, JSON.stringify({ draft, wires })).catch(() => {})
  }, [draft, wires, date])

  // ── Mutations ──
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

  const reset = useCallback(() => {
    setDraft(unpairPortal(portalEntries))
    setNotice(null)
  }, [portalEntries])

  const dismissNotice = useCallback(() => setNotice(null), [])

  const addWire = useCallback((draftTime: string, localTime: string) => {
    setWires((ws) => {
      const filtered = ws.filter((w) => w.draftTime !== draftTime && w.localTime !== localTime)
      return [...filtered, { draftTime, localTime }]
    })
  }, [])

  const removeWire = useCallback((draftTime: string) => {
    setWires((ws) => ws.filter((w) => w.draftTime !== draftTime))
  }, [])

  // ── Derived ──
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
    addPunch,
    editPunch,
    removePunch,
    setReason,
    copyFromLocal,
    reset,
    addWire,
    removeWire,
  }
}
