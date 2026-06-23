// Renderer-side singleton store for EOD AI generation.
//
// The generation runs in the main process; the result is pushed back over IPC.
// Keeping the job state in a module-level store (rather than inside the dialog
// component) means a run SURVIVES navigating away or switching tabs — the
// component can unmount and remount freely while the run continues and its
// result is captured. The last completed draft is also persisted to
// localStorage, so it's still there after an app restart (same day).

import { useSyncExternalStore } from 'react'
import { makeId } from './eod-types'
import type { EodFormState, EodSimpleSection } from './eod-types'
import type { EodAiDraft, EodFactSheet } from './eod-ai-types'
import { filterMeetings } from './eod-meeting-sync'
import { allSelectableIds } from './eod-ai-selection'

export type EodAiStatus = 'idle' | 'running' | 'done' | 'error'
export type EodAiRunMode = 'generate' | 'refine'

export interface EodAiState {
  status: EodAiStatus
  runMode: EodAiRunMode
  stepIdx: number
  startedAt: number | null
  generatedAt: number | null
  result: EodFormState | null
  rawDraft: EodAiDraft | null
  factSheet: EodFactSheet | null
  dropped: string[]
  error: { message: string; code: string; raw?: string } | null
  lastRefine: string | null
  /** Picker selection — ids of tasks/subs/section items in `result`. */
  selectedIds: string[]
  /** Items already merged into the form this run (dimmed + tagged in picker). */
  addedIds: string[]
  /** True when the gather subprocess had no Jira tools — MCP needs re-auth. */
  jiraUnavailable: boolean
}

export interface StartGenerationInput {
  pastEods: Array<{ date: string; plainText: string }>
  notes: string
  filterMode: 'blocklist' | 'allowlist'
  filterPaths: string[]
  instructions: string
}

// ── Draft → form state ──────────────────────────────────────────────────────

function toSection(s: EodAiDraft['otherTasks']): EodSimpleSection {
  return { items: s.items.map(i => ({ id: makeId(), text: i.text })), isNA: s.isNA }
}

export function draftToFormState(draft: EodAiDraft): EodFormState {
  return {
    date: new Date().toLocaleDateString('en-CA'),
    projects: draft.projects.map(p => ({
      id: makeId(),
      name: p.name,
      status: p.status,
      statusNote: p.statusNote,
      tasksCompleted: p.tasksCompleted.map(t => ({
        id: makeId(),
        text: t.text,
        subBullets: t.subBullets.map(s => ({ id: makeId(), text: s.text })),
      })),
    })),
    otherTasks: toSection(draft.otherTasks),
    concerns: toSection(draft.concerns),
    nextDayPlan: toSection(draft.nextDayPlan),
    upcomingHolidays: toSection(draft.upcomingHolidays),
  }
}

function stepIndexForPhase(phase: string): number {
  switch (phase) {
    case 'sessions': return 0
    case 'gather':
    case 'jira': return 1
    case 'bitbucket': return 2
    case 'write': return 3
    default: return 0
  }
}

// ── Store internals ───────────────────────────────────────────────────────────

const LS_KEY = 'traccia:eod-ai-last'

function today(): string {
  return new Date().toLocaleDateString('en-CA')
}

function idle(): EodAiState {
  return {
    status: 'idle', runMode: 'generate', stepIdx: 0, startedAt: null, generatedAt: null,
    result: null, rawDraft: null, factSheet: null, dropped: [], error: null, lastRefine: null,
    selectedIds: [], addedIds: [], jiraUnavailable: false,
  }
}

function restoreInitial(): EodAiState {
  const base = idle()
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return base
    const p = JSON.parse(raw) as {
      date?: string; rawDraft?: EodAiDraft; result?: EodFormState; factSheet?: EodFactSheet | null
      dropped?: string[]; generatedAt?: number; selectedIds?: string[]; addedIds?: string[]
    }
    if (p && p.date === today() && p.rawDraft) {
      // Restore the persisted `result` so its ids still match selectedIds/addedIds
      // (draftToFormState mints fresh ids, which would desync the selection).
      const result = p.result ?? draftToFormState(p.rawDraft)
      return {
        ...base,
        status: 'done',
        rawDraft: p.rawDraft,
        result,
        factSheet: p.factSheet ?? null,
        dropped: Array.isArray(p.dropped) ? p.dropped : [],
        generatedAt: typeof p.generatedAt === 'number' ? p.generatedAt : null,
        selectedIds: Array.isArray(p.selectedIds) ? p.selectedIds : allSelectableIds(result),
        addedIds: Array.isArray(p.addedIds) ? p.addedIds : [],
      }
    }
  } catch { /* ignore corrupt cache */ }
  return base
}

let state: EodAiState = restoreInitial()
const listeners = new Set<() => void>()
let requestId: string | null = null
let cancelled = false
let listening = false

function emit(): void {
  for (const l of listeners) l()
}

function setState(patch: Partial<EodAiState>): void {
  state = { ...state, ...patch }
  emit()
}

function persistDone(): void {
  try {
    if (!state.rawDraft) return
    localStorage.setItem(LS_KEY, JSON.stringify({
      date: today(),
      rawDraft: state.rawDraft,
      result: state.result,
      factSheet: state.factSheet,
      dropped: state.dropped,
      generatedAt: state.generatedAt,
      selectedIds: state.selectedIds,
      addedIds: state.addedIds,
    }))
  } catch { /* quota — non-fatal */ }
}

/** Drop a completed draft once the day rolls over (app left open across
 *  midnight). A restart is already handled by restoreInitial's date gate; this
 *  covers the warm case. No-op while a run is in flight. */
function dropStaleDraft(): void {
  if (
    state.status === 'done' &&
    state.generatedAt &&
    new Date(state.generatedAt).toLocaleDateString('en-CA') !== today()
  ) {
    try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
    state = idle()
    emit()
  }
}

/** Attach the IPC listeners exactly once, for the lifetime of the renderer. */
function ensureListening(): void {
  if (listening || typeof window === 'undefined' || !window.electronAPI) return
  listening = true
  // Returning to the app after a day change clears a stale completed draft so
  // yesterday's EOD never surfaces today (panel or sidebar indicator).
  window.addEventListener('focus', dropStaleDraft)
  window.electronAPI.onEodAiPhase(d => {
    if (d.requestId !== requestId || cancelled) return
    setState({ stepIdx: Math.max(state.stepIdx, stepIndexForPhase(d.phase)) })
  })
  window.electronAPI.onEodAiDone(d => {
    if (d.requestId !== requestId || cancelled) return
    requestId = null
    // Fresh draft → all items selected (the quickie default), marks cleared.
    const result = draftToFormState(d.draft)
    setState({
      status: 'done',
      rawDraft: d.draft,
      result,
      factSheet: d.factSheet,
      dropped: Array.isArray(d.dropped) ? d.dropped : [],
      generatedAt: Date.now(),
      selectedIds: allSelectableIds(result),
      addedIds: [],
      jiraUnavailable: d.jiraUnavailable === true,
    })
    persistDone()
  })
  window.electronAPI.onEodAiError(d => {
    if (d.requestId !== requestId || cancelled) return
    requestId = null
    setState({ status: 'error', error: { message: d.error, code: d.code, raw: d.raw } })
  })
}

// ── Public hook + actions ───────────────────────────────────────────────────

export function useEodAiState(): EodAiState {
  ensureListening()
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb) },
    () => state,
    () => state,
  )
}

export async function startGeneration(input: StartGenerationInput): Promise<void> {
  ensureListening()
  cancelled = false
  requestId = null
  setState({
    status: 'running', runMode: 'generate', stepIdx: 0, startedAt: Date.now(),
    result: null, rawDraft: null, factSheet: null, dropped: [], error: null, lastRefine: null,
    selectedIds: [], addedIds: [],
  })

  let meetings: Array<{ title: string; durationMin: number }> = []
  try {
    const res = await window.electronAPI.eodGetMeetingsToday()
    if (res.ok) meetings = filterMeetings(res.meetings).map(m => ({ title: m.title.trim(), durationMin: m.duration }))
  } catch { /* meetings optional */ }
  if (cancelled) return

  try {
    const { requestId: id } = await window.electronAPI.eodAiGenerate({
      pastEods: input.pastEods, meetings, notes: input.notes,
      filterMode: input.filterMode, filterPaths: input.filterPaths, instructions: input.instructions,
    })
    if (cancelled) { window.electronAPI.aiCancel(id); return }
    requestId = id
  } catch (err) {
    setState({ status: 'error', error: { message: String(err instanceof Error ? err.message : err), code: 'unknown' } })
  }
}

export async function startRefine(instruction: string, instructions: string): Promise<void> {
  ensureListening()
  if (!state.factSheet || !state.rawDraft || !instruction.trim()) return
  cancelled = false
  requestId = null
  setState({ status: 'running', runMode: 'refine', stepIdx: 3, startedAt: Date.now(), error: null, lastRefine: instruction.trim() })
  try {
    const { requestId: id } = await window.electronAPI.eodAiRefine({
      factSheet: state.factSheet, previousDraft: state.rawDraft,
      instruction: instruction.trim(), instructions,
    })
    if (cancelled) { window.electronAPI.aiCancel(id); return }
    requestId = id
  } catch (err) {
    setState({ status: 'error', error: { message: String(err instanceof Error ? err.message : err), code: 'unknown' } })
  }
}

/** Cancel the active run, falling back to the previous draft if there was one. */
export function cancelRun(): void {
  if (requestId) {
    cancelled = true
    try { window.electronAPI.aiCancel(requestId) } catch { /* ignore */ }
    requestId = null
  }
  setState({
    status: state.result ? 'done' : 'idle',
    lastRefine: state.runMode === 'refine' ? null : state.lastRefine,
  })
}

export function clearLastRefine(): void {
  setState({ lastRefine: null })
}

/** Replace the picker selection (ids of tasks/subs/section items in `result`). */
export function setSelectedIds(ids: string[]): void {
  setState({ selectedIds: ids })
  persistDone()
}

/** Mark ids as added (dim + tag) and uncheck them so they don't re-add by accident. */
export function markAdded(ids: string[]): void {
  const addedSet = new Set([...state.addedIds, ...ids])
  const dropped = new Set(ids)
  setState({
    addedIds: Array.from(addedSet),
    selectedIds: state.selectedIds.filter(id => !dropped.has(id)),
  })
  persistDone()
}
