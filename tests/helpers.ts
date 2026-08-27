// Builders for the shapes the EOD pipeline passes around. Tests state only the
// fields they care about; everything else gets a harmless default, so adding a
// field to one of these types does not require touching every test.

import type { SessionDigest } from '../electron/eod-session-digest'
import type { RepoEvidence } from '../electron/eod-git-evidence'
import type { EodFactSheet, EodFactTicket } from '../src/lib/eod-ai-types'

export function digest(over: Partial<SessionDigest> = {}): SessionDigest {
  return {
    cwd: 'C:/repos/app',
    gitBranch: 'main',
    startedAt: '2026-08-26T09:00:00.000Z',
    endedAt: '2026-08-26T17:00:00.000Z',
    userPrompts: [],
    assistantSummaries: [],
    filesChanged: [],
    commands: [],
    delegations: [],
    ...over,
  }
}

export function repo(over: Partial<RepoEvidence> = {}): RepoEvidence {
  return {
    repoPath: 'C:/repos/app',
    branch: 'main',
    commitsToday: [],
    uncommitted: null,
    ...over,
  }
}

export function ticket(over: Partial<EodFactTicket> = {}): EodFactTicket {
  return {
    key: 'ATON-100',
    title: 'A ticket',
    titleSource: 'branch-only',
    statusSignal: 'wip',
    statusEvidence: '',
    actions: [],
    ...over,
  }
}

export function factSheet(over: Partial<EodFactSheet> = {}): EodFactSheet {
  return { tickets: [], unmatchedWork: [], ...over }
}

/** A draft as the write phase emits it, before verification. */
export function rawDraft(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    projects: [],
    otherTasks: { items: [], isNA: true },
    concerns: { items: [], isNA: true },
    nextDayPlan: { items: [], isNA: true },
    upcomingHolidays: { items: [], isNA: true },
    ...over,
  }
}

/** One transcript line as Claude Code writes it into a .jsonl session file. */
export function line(over: Record<string, unknown>): string {
  return JSON.stringify({ timestamp: '2026-08-26T10:00:00.000Z', ...over })
}

export function userLine(text: string, over: Record<string, unknown> = {}): string {
  return line({ type: 'user', cwd: 'C:/repos/app', message: { role: 'user', content: text }, ...over })
}

export function assistantLine(
  content: Array<Record<string, unknown>>,
  over: Record<string, unknown> = {},
): string {
  return line({ type: 'assistant', message: { role: 'assistant', content }, ...over })
}

export const text = (t: string) => ({ type: 'text', text: t })
export const toolUse = (name: string, input: Record<string, unknown> = {}) =>
  ({ type: 'tool_use', name, input })
