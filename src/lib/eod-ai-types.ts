// Shared types for the AI EOD generation feature.
// Imported by both the renderer (dialog) and the main process (orchestrator),
// mirroring the outlook-meetings.ts cross-import pattern.

export type EodAiPhaseId = 'sessions' | 'gather' | 'jira' | 'bitbucket' | 'write'

export interface EodAiPhaseEvent {
  requestId: string
  phase: EodAiPhaseId
  label: string
}

/** EodFormState minus ids and date — exactly what the write phase outputs. */
export interface EodAiDraft {
  projects: Array<{
    name: string
    status: 'green' | 'yellow' | 'red' | 'none'
    statusNote: string | null
    tasksCompleted: Array<{
      text: string
      subBullets: Array<{ text: string }>
    }>
  }>
  otherTasks: { items: Array<{ text: string }>; isNA: boolean }
  concerns: { items: Array<{ text: string }>; isNA: boolean }
  nextDayPlan: { items: Array<{ text: string }>; isNA: boolean }
  upcomingHolidays: { items: Array<{ text: string }>; isNA: boolean }
}

export interface EodAiDoneEvent {
  requestId: string
  draft: EodAiDraft
  /** Task lines removed by verification (ticket key absent from evidence). */
  dropped: string[]
  durationMs: number
  /** Evidence behind the draft — drives the evidence view and refine reruns. */
  factSheet: EodFactSheet
  /** Project cwds digested this run before filtering (empty for refine runs). */
  seenProjects: string[]
  /** True when the gather subprocess had no Jira/Atlassian tools — MCP needs re-auth. */
  jiraUnavailable?: boolean
}

export interface EodAiErrorEvent {
  requestId: string
  error: string
  code: string
  /** Raw model output, present when JSON parsing failed so the user can copy manually. */
  raw?: string
}

export interface EodAiGeneratePayload {
  /** Last sent EODs, newest first. plainText drives both style and the ticket-title index. */
  pastEods: Array<{ date: string; plainText: string }>
  /** Today's meetings, already filtered (no canceled/declined/all-day). */
  meetings: Array<{ title: string; durationMin: number }>
  /** Per-run user notes — authoritative facts/corrections for today. May be ''. */
  notes: string
  /** Project filter applied code-side before any prompt is built. */
  filterMode: 'blocklist' | 'allowlist'
  /** Paths for the active mode (excluded in blocklist, included in allowlist). */
  filterPaths: string[]
  /** Standing instructions doc — style rules + declared recurring work. */
  instructions: string
}

export interface EodAiRefinePayload {
  factSheet: EodFactSheet
  previousDraft: EodAiDraft
  /** e.g. "make the second bullet vaguer" */
  instruction: string
  instructions: string
}

export interface EodAiProjectInfo {
  path: string
  /** Sessions seen today in this project (0 for historically-known repos). */
  sessionsToday: number
}

/** Evidence-tagged fact sheet produced by the gather phase. */
export interface EodFactTicket {
  key: string
  title: string
  titleSource: 'jira' | 'pastEod' | 'branch-only' | string
  statusSignal: 'done' | 'wip' | string
  statusEvidence: string
  actions: Array<{ text: string; source: string }>
}

export interface EodFactSheet {
  tickets: EodFactTicket[]
  meetings: string[]
  unmatchedWork: string[]
}
