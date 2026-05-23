export type TaskStatus = 'WIP' | 'Done' | 'Hold'

export interface ParsedTaskText {
  taskId: string | null
  description: string
  hours: number | null
  status: TaskStatus | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TASK_ID_RE = /^([A-Z][A-Z0-9]*-\d+)\s*[-–]\s*/

// Matches canonical arrow + status at end (case-insensitive, any arrow variant).
// Uses proper arrow chars only (not bare dash) to avoid false positives on "task - note".
const CANONICAL_STATUS_RE = /\s*(?:->|>|→|–>)\s*(wip|done|hold)\s*$/i

// Hours suffix: handles "2hr", "(2 hr)", "2.5 hours", "(2.5hrs)" etc.
// Lookbehind ensures it starts at a word boundary (space or string start).
// The (?<![^\s]) negative lookbehind = "not preceded by non-whitespace".
const HOURS_SUFFIX_RE = /(?<![^\s])\(?(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\)?$/i

// Bare number at end: "2", "2.5" — only accepted when < 10.
const BARE_NUMBER_SUFFIX_RE = /(?<![^\s])(\d+(?:\.\d+)?)$/

const STATUS_ALIASES: Record<string, TaskStatus> = {
  wip: 'WIP', inprogress: 'WIP', wp: 'WIP', ww: 'WIP',
  done: 'Done', complete: 'Done', completed: 'Done', finish: 'Done', finished: 'Done', dd: 'Done',
  hold: 'Hold', onhold: 'Hold',
}

// Multi-word phrases, checked before single-word (order: longest first)
const MULTI_STATUS_PHRASES: [phrase: string, status: TaskStatus][] = [
  ['in progress', 'WIP'],
  ['on hold', 'Hold'],
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function lastToken(s: string): [token: string, rest: string] {
  const i = s.lastIndexOf(' ')
  return i === -1 ? [s, ''] : [s.slice(i + 1), s.slice(0, i).trimEnd()]
}

function tryConsumeHours(s: string): [hours: number | null, rest: string] {
  // Try explicit unit first: "2hr", "(2 hr)", "2.5 hours", etc.
  const um = s.match(HOURS_SUFFIX_RE)
  if (um) {
    const n = parseFloat(um[1])
    return [n, s.slice(0, s.length - um[0].length).trimEnd()]
  }
  // Try bare number < 10 at end (no unit — e.g. user just types "2")
  const nm = s.match(BARE_NUMBER_SUFFIX_RE)
  if (nm) {
    const n = parseFloat(nm[1])
    if (n > 0 && n < 10) return [n, s.slice(0, s.length - nm[0].length).trimEnd()]
  }
  return [null, s]
}

function tryConsumeStatus(s: string): [status: TaskStatus | null, rest: string] {
  // Multi-word phrases first
  for (const [phrase, sv] of MULTI_STATUS_PHRASES) {
    if (s.toLowerCase().endsWith(phrase)) {
      return [sv, s.slice(0, s.length - phrase.length).trimEnd()]
    }
  }
  // Single last token
  const [tok] = lastToken(s)
  const sv = STATUS_ALIASES[tok.toLowerCase()] ?? null
  if (sv !== null) return [sv, s.slice(0, s.length - tok.length).trimEnd()]
  return [null, s]
}

// ── Core parser ───────────────────────────────────────────────────────────────

export function parseTaskText(input: string): ParsedTaskText {
  let remaining = input.trim()

  // 1. Extract task ID from left
  let taskId: string | null = null
  const idMatch = remaining.match(TASK_ID_RE)
  if (idMatch) {
    taskId = idMatch[1]
    remaining = remaining.slice(idMatch[0].length).trim()
  }

  // 2. Strip canonical arrow-status suffix (handles idempotency re-parse).
  //    e.g. "Fix bug (2 hr) → WIP" — strip " → WIP" first, then parse "(2 hr)".
  let status: TaskStatus | null = null
  const canonicalMatch = remaining.match(CANONICAL_STATUS_RE)
  if (canonicalMatch) {
    status = STATUS_ALIASES[canonicalMatch[1].toLowerCase()] ?? null
    remaining = remaining.slice(0, remaining.length - canonicalMatch[0].length).trimEnd()
  }

  // 3. Right-to-left tail consumption: up to 2 passes for hours + status in any order
  let hours: number | null = null

  for (let pass = 0; pass < 2; pass++) {
    let consumed = false

    if (status === null) {
      const [sv, rest] = tryConsumeStatus(remaining)
      if (sv !== null) { status = sv; remaining = rest; consumed = true }
    }

    if (hours === null) {
      const [h, rest] = tryConsumeHours(remaining)
      if (h !== null) { hours = h; remaining = rest; consumed = true }
    }

    if (!consumed) break
  }

  // 4. Clean up any orphaned arrow left in description (e.g. "Fix bug →" after consuming status)
  const description = remaining.trim().replace(/\s*(?:->|>|→|–>)\s*$/, '')

  return { taskId, description, hours, status }
}

// ── Formatter ─────────────────────────────────────────────────────────────────

export function formatTaskText({ taskId, description, hours, status }: ParsedTaskText): string {
  let s = taskId ? `${taskId} - ${description}` : description
  if (hours !== null) {
    // Integer hours: "2 hr", decimal: "2.5 hr"
    const hoursStr = Number.isInteger(hours) ? String(hours) : String(hours)
    s += ` (${hoursStr} hr)`
  }
  if (status !== null) s += ` → ${status}`
  return s
}

// ── Convenience ───────────────────────────────────────────────────────────────

/** Parse + reformat input to canonical form. Returns original string unchanged if nothing to normalize. */
export function normalizeTaskText(input: string): string {
  if (!input.trim()) return input
  const parsed = parseTaskText(input)
  const normalized = formatTaskText(parsed)
  return normalized === input.trim() ? input : normalized
}
