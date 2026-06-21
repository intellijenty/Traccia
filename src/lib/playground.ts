/**
 * Miss-punch playground — pure domain core.
 *
 * Reconciles portal building-presence punches with local PC-session events so
 * the user can reconstruct missing punches for the portal's "Request Time Entry"
 * dialog (7-day self-service window).
 *
 * Model: portal sessions are un-paired into individual punches; punches are
 * re-paired for display. Odd count = dangling punch = miss-punch.
 * Draft origins: "anchor" (portal, read-only) | "added" (user-created, submitted).
 *
 * Pure: no IPC, no React, no Date.now.
 */

import type { PortalEntry, PunchEntry, EntryTrigger } from "@/lib/types"

export type PunchOrigin = "anchor" | "added"

/** A punch on the editable Draft lane. */
export interface DraftPunch {
  id: string
  /** ISO-8601 UTC timestamp of the punch. */
  time: string
  origin: PunchOrigin
  /** Free-text reason (added punches only; required before it counts as ready). */
  reason: string
}

/** A paired session for display. outTime null = dangling (unclosed) punch. */
export interface Session {
  inTime: string
  outTime: string | null
}

export interface PairResult {
  sessions: Session[]
  /** Number of unpaired punches (0 or 1 for a flat consecutive pairing). */
  danglingCount: number
  /** True when every punch is paired (even count). */
  balanced: boolean
}

/** A paired local session, carrying the triggers that bound it (for evidence). */
export interface LocalSession {
  inTime: string
  inTrigger: EntryTrigger
  outTime: string | null
  outTrigger: EntryTrigger | null
}

const ms = (iso: string): number => new Date(iso).getTime()
const byTime = <T extends { time: string }>(a: T, b: T): number => ms(a.time) - ms(b.time)

/** Stable id for a new punch/suggestion. */
let idCounter = 0
function newId(prefix: string): string {
  idCounter += 1
  // crypto.randomUUID exists in the renderer; fall back to a counter.
  const rand = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${idCounter}`
  return `${prefix}_${rand}`
}

// ── Portal → punches ─────────────────────────────────────────────────────────

/**
 * Un-pair portal sessions into individual punch anchors.
 * Each entry → an IN punch (intime) and, if present, an OUT punch (outtime).
 * A miss-punch entry (outtime null) yields a single dangling IN punch.
 */
export function unpairPortal(entries: PortalEntry[]): DraftPunch[] {
  const punches: DraftPunch[] = []
  for (const e of entries) {
    if (e.intime) {
      punches.push({ id: newId("anchor"), time: e.intime, origin: "anchor", reason: "" })
    }
    if (e.outtime) {
      punches.push({ id: newId("anchor"), time: e.outtime, origin: "anchor", reason: "" })
    }
  }
  return punches.sort(byTime)
}

// ── Punches → sessions ─────────────────────────────────────────────────────

/** All draft punches sorted by time for pairing. */
export function activePunches(draft: DraftPunch[]): DraftPunch[] {
  return [...draft].sort(byTime)
}

/**
 * Pair a sorted punch list into sessions, consecutively: 0=IN, 1=OUT, 2=IN…
 * Mirrors the portal's odd/even pairing. An odd count leaves a trailing
 * dangling IN.
 */
export function pairPunches(punches: { time: string }[]): PairResult {
  const sorted = [...punches].sort(byTime)
  const sessions: Session[] = []
  for (let i = 0; i < sorted.length; i += 2) {
    sessions.push({ inTime: sorted[i].time, outTime: sorted[i + 1]?.time ?? null })
  }
  const danglingCount = sorted.length % 2
  return { sessions, danglingCount, balanced: danglingCount === 0 }
}

/** Total working minutes from complete pairs (dangling contributes nothing). */
export function workingMinutes(pair: PairResult): number {
  let mins = 0
  for (const s of pair.sessions) {
    if (s.outTime) mins += Math.floor((ms(s.outTime) - ms(s.inTime)) / 60000)
  }
  return mins
}

// ── Local events → sessions ──────────────────────────────────────────────────

/** Pair local LOGIN/LOGOUT events into sessions (for the read-only Local lane). */
export function localSessions(events: PunchEntry[]): LocalSession[] {
  const sorted = [...events].sort((a, b) => ms(a.timestamp) - ms(b.timestamp))
  const sessions: LocalSession[] = []
  let open: PunchEntry | null = null
  for (const e of sorted) {
    if (e.type === "LOGIN") {
      // A new LOGIN while one is open → close the previous as dangling first.
      if (open) {
        sessions.push({ inTime: open.timestamp, inTrigger: open.trigger, outTime: null, outTrigger: null })
      }
      open = e
    } else {
      // LOGOUT
      if (open) {
        sessions.push({ inTime: open.timestamp, inTrigger: open.trigger, outTime: e.timestamp, outTrigger: e.trigger })
        open = null
      }
      // LOGOUT with no open LOGIN → ignore (can't form a session).
    }
  }
  if (open) sessions.push({ inTime: open.timestamp, inTrigger: open.trigger, outTime: null, outTrigger: null })
  return sessions
}

/** Format an ISO timestamp as a short clock e.g. "6:45 PM". */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

/** Format minutes as "8h 32m". */
export function formatMins(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// ── Helpers for the UI ──────────────────────────────────────────────────────

/** Make a fresh added punch at the given ISO time. */
export function makeAddedPunch(time: string, reason = ""): DraftPunch {
  return { id: newId("added"), time, origin: "added", reason }
}

/** Added punches ready for submission — the copy-list. */
export function submittablePunches(draft: DraftPunch[]): DraftPunch[] {
  return draft.filter((p) => p.origin === "added").sort(byTime)
}

/** Evidence wire: links a draft punch (by its ISO time) to a local PC event. Annotation-only. */
export interface Wire {
  draftTime: string
  localTime: string
}
