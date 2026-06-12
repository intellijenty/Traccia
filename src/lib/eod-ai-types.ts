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
