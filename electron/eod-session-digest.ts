// Deterministic digester for Claude Code session transcripts.
//
// Reads ~/.claude/projects/*/*.jsonl, keeps only today's user prompts,
// assistant text and tool-use metadata, and drops everything else (tool
// results, attachments, sidechains, snapshots). A 4–16 MB workday of raw
// JSONL reduces to a few dozen KB of pure work evidence that gets injected
// directly into the gather prompt — the agent never Reads raw transcripts.

import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface SessionDigest {
  /** Folder the session ran in (exact path from the transcript's cwd field). */
  cwd: string
  gitBranch: string | null
  startedAt: string // ISO timestamp of first kept message
  endedAt: string   // ISO timestamp of last kept message
  userPrompts: string[]
  assistantSummaries: string[]
  filesTouched: string[]
  commands: string[]
}

export interface DigestResult {
  digests: SessionDigest[]
  /** Distinct cwd values seen today — candidate git repos. */
  repoPaths: string[]
  /** Number of session files that failed to parse (corrupt/unreadable). */
  skippedFiles: number
}

// Sessions spawned by Traccia's own EOD generation open with this marker so
// they never pollute the next day's digest.
export const TRACCIA_EOD_SENTINEL = '[TRACCIA-EOD]'

// A "work day" starts at 04:00 local, not midnight — work done at 01:30 still
// belongs to the previous day's EOD (night-owl support).
const DAY_START_HOUR = 4

/** Start of the current effective work day. Shared with git evidence so both
 *  sources use the identical boundary. */
export function effectiveDayStart(now = new Date()): Date {
  const start = new Date(now)
  start.setHours(DAY_START_HOUR, 0, 0, 0)
  if (now.getTime() < start.getTime()) start.setDate(start.getDate() - 1)
  return start
}

const USER_PROMPT_CAP = 400
const ASSISTANT_TEXT_CAP = 600
const MAX_USER_PROMPTS = 25
const MAX_ASSISTANT_SUMMARIES = 40
const MAX_FILES_TOUCHED = 25
const MAX_COMMANDS = 15
const COMMAND_CAP = 120

type ContentBlock = {
  type?: string
  text?: string
  name?: string
  input?: { file_path?: string; notebook_path?: string; command?: string }
}

type TranscriptLine = {
  type?: string
  isSidechain?: boolean
  isMeta?: boolean
  timestamp?: string
  cwd?: string
  gitBranch?: string
  message?: {
    role?: string
    content?: string | ContentBlock[]
  }
}

function truncate(text: string, cap: number): string {
  const t = text.trim()
  return t.length <= cap ? t : t.slice(0, cap) + '…'
}

/** Injected wrappers, command transcripts and reminders — not real user prompts. */
function isNoisePrompt(text: string): boolean {
  const t = text.trimStart()
  return (
    t.length === 0 ||
    t.startsWith('<') ||          // <command-name>, <local-command-stdout>, <system-reminder>…
    t.startsWith('Caveat:') ||
    t.startsWith('[Request interrupted')
  )
}

function digestFile(content: string, dayStartMs: number): SessionDigest | null {
  const digest: SessionDigest = {
    cwd: '',
    gitBranch: null,
    startedAt: '',
    endedAt: '',
    userPrompts: [],
    assistantSummaries: [],
    filesTouched: [],
    commands: [],
  }
  const files = new Set<string>()
  const commands = new Set<string>()

  for (const rawLine of content.split('\n')) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    let line: TranscriptLine
    try {
      line = JSON.parse(trimmed) as TranscriptLine
    } catch {
      continue // partial write / corrupt line — skip, never fail the file
    }

    if (line.type !== 'user' && line.type !== 'assistant') continue
    if (line.isSidechain || line.isMeta) continue
    if (!line.timestamp) continue
    const ts = new Date(line.timestamp).getTime()
    if (Number.isNaN(ts) || ts < dayStartMs) continue

    if (line.cwd) digest.cwd = line.cwd
    if (line.gitBranch) digest.gitBranch = line.gitBranch
    if (!digest.startedAt) digest.startedAt = line.timestamp
    digest.endedAt = line.timestamp

    const content = line.message?.content

    if (line.type === 'user') {
      let text = ''
      if (typeof content === 'string') {
        text = content
      } else if (Array.isArray(content)) {
        // user lines carrying only tool_result blocks are tool output, not prompts
        text = content
          .filter(b => b?.type === 'text' && typeof b.text === 'string')
          .map(b => b.text as string)
          .join('\n')
      }
      if (text && !isNoisePrompt(text)) {
        // Whole session is one of our own generation runs — discard it entirely.
        if (text.trimStart().startsWith(TRACCIA_EOD_SENTINEL)) return null
        if (digest.userPrompts.length < MAX_USER_PROMPTS) {
          digest.userPrompts.push(truncate(text, USER_PROMPT_CAP))
        }
      }
      continue
    }

    // assistant
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        if (digest.assistantSummaries.length < MAX_ASSISTANT_SUMMARIES) {
          digest.assistantSummaries.push(truncate(block.text, ASSISTANT_TEXT_CAP))
        }
      } else if (block.type === 'tool_use') {
        const input = block.input
        const filePath = input?.file_path ?? input?.notebook_path
        if (typeof filePath === 'string' && filePath) files.add(filePath)
        if (typeof input?.command === 'string' && input.command.trim()) {
          commands.add(truncate(input.command, COMMAND_CAP))
        }
      }
    }
  }

  if (digest.userPrompts.length === 0 && digest.assistantSummaries.length === 0) {
    return null // nothing from today in this file
  }

  digest.filesTouched = Array.from(files).slice(0, MAX_FILES_TOUCHED)
  digest.commands = Array.from(commands).slice(0, MAX_COMMANDS)
  return digest
}

/**
 * Digest every Claude Code session that has activity today (local time).
 * Never throws — a missing projects dir or unreadable files yield an empty
 * or partial result.
 */
export async function digestTodaySessions(now = new Date()): Promise<DigestResult> {
  const result: DigestResult = { digests: [], repoPaths: [], skippedFiles: 0 }

  const projectsDir = join(homedir(), '.claude', 'projects')
  if (!existsSync(projectsDir)) return result

  const dayStartMs = effectiveDayStart(now).getTime()
  // Cheap pre-filter: only open files written since shortly before the day boundary.
  const mtimeFloor = dayStartMs - 2 * 60 * 60 * 1000

  let projectDirs: string[]
  try {
    projectDirs = (await fs.readdir(projectsDir, { withFileTypes: true }))
      .filter(d => d.isDirectory())
      .map(d => join(projectsDir, d.name))
  } catch {
    return result
  }

  const candidates: string[] = []
  for (const dir of projectDirs) {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
      const filePath = join(dir, entry.name)
      try {
        const stat = await fs.stat(filePath)
        if (stat.mtimeMs >= mtimeFloor) candidates.push(filePath)
      } catch {
        // race: file removed between readdir and stat
      }
    }
  }

  const repoPaths = new Set<string>()
  for (const filePath of candidates) {
    try {
      const content = await fs.readFile(filePath, 'utf8')
      const digest = digestFile(content, dayStartMs)
      if (digest) {
        result.digests.push(digest)
        if (digest.cwd) repoPaths.add(digest.cwd)
      }
    } catch {
      result.skippedFiles++
    }
  }

  result.digests.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  result.repoPaths = Array.from(repoPaths)
  return result
}
