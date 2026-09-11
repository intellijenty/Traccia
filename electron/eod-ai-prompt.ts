// Prompt builders for the two AI phases of EOD generation.
//
// Phase GATHER (agentic): session digests + git evidence + meetings + ticket
// index → evidence-tagged fact sheet JSON, cross-referenced against Jira via
// the user's own Claude Code MCP connector.
//
// Phase WRITE (plain): fact sheet + past EODs (style fingerprint) → EodFormState
// shaped JSON in the user's personal voice.

import type { SessionDigest } from "./eod-session-digest"
import { TRACCIA_EOD_SENTINEL } from "./eod-session-digest"
import type { RepoEvidence } from "./eod-git-evidence"
import type { EodFactSheet } from "../src/lib/eod-ai-types"

// Char budgets — keep the gather prompt comfortably inside the context window.
const TOTAL_DIGEST_BUDGET = 60_000
const MIN_SESSION_BUDGET = 2_000
const MAX_SESSION_BUDGET = 8_000
const PAST_EOD_BUDGET = 6_000
const TICKET_INDEX_MAX = 60

// ── Ticket-title index from past EODs ─────────────────────────────────────────

export interface TicketIndexEntry {
  key: string
  title: string
}

/** Extract "KEY - title" pairs from past EOD plain text. Newest EOD wins. */
export function extractTicketIndex(
  pastEods: Array<{ date: string; plainText: string }>
): TicketIndexEntry[] {
  const index = new Map<string, string>()
  // pastEods arrive newest-first; first occurrence of a key wins
  const lineRx = /\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b\s*[-–—:]\s*([^\n→]{4,140})/g
  for (const eod of pastEods) {
    if (typeof eod?.plainText !== "string") continue
    for (const match of eod.plainText.matchAll(lineRx)) {
      const key = match[1]
      const title = match[2].trim().replace(/\s+/g, " ")
      if (!index.has(key) && title) index.set(key, title)
      if (index.size >= TICKET_INDEX_MAX) break
    }
    if (index.size >= TICKET_INDEX_MAX) break
  }
  return Array.from(index, ([key, title]) => ({ key, title }))
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function timeOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "?"
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

/** Trim a session block to budget keeping head (intent) and tail (outcome). */
function trimToBudget(text: string, budget: number): string {
  if (text.length <= budget) return text
  const head = Math.floor(budget * 0.6)
  const tail = budget - head
  return (
    text.slice(0, head) + "\n…[trimmed]…\n" + text.slice(text.length - tail)
  )
}

function formatSession(
  s: SessionDigest,
  index: number,
  budget: number
): string {
  const lines: string[] = []
  lines.push(`### Session ${index + 1} — ${s.cwd || "unknown dir"}`)
  lines.push(
    `Branch: ${s.gitBranch ?? "n/a"} | Time: ${timeOf(s.startedAt)}–${timeOf(s.endedAt)}`
  )
  if (s.userPrompts.length > 0) {
    lines.push("User asked:")
    for (const p of s.userPrompts)
      lines.push(`- ${p.replace(/\s*\n\s*/g, " ")}`)
  }
  if (s.assistantSummaries.length > 0) {
    lines.push("Assistant reported (one outcome statement per turn):")
    for (const a of s.assistantSummaries)
      lines.push(`- ${a.replace(/\s*\n\s*/g, " ")}`)
  }
  if (s.delegations.length > 0) {
    lines.push("Delegated to subagents:")
    for (const d of s.delegations) lines.push(`- ${d}`)
  }
  if (s.filesChanged.length > 0)
    lines.push(`Files changed: ${s.filesChanged.join(", ")}`)
  if (s.commands.length > 0)
    lines.push(`Commands run: ${s.commands.join(" ; ")}`)
  return trimToBudget(lines.join("\n"), budget)
}

function formatGitEvidence(repos: RepoEvidence[]): string {
  if (repos.length === 0) return "(no git activity detected today)"
  return repos
    .map((r) => {
      const lines = [`### ${r.repoPath}`, `Current branch: ${r.branch}`]
      if (r.commitsToday.length > 0) {
        lines.push("Commits today:")
        for (const c of r.commitsToday) lines.push(`- ${c}`)
      }
      if (r.uncommitted) lines.push(`Uncommitted work: ${r.uncommitted}`)
      return lines.join("\n")
    })
    .join("\n\n")
}

function formatPastEods(
  pastEods: Array<{ date: string; plainText: string }>
): string {
  const blocks: string[] = []
  let used = 0
  for (const eod of pastEods) {
    if (typeof eod?.plainText !== "string" || !eod.plainText.trim()) continue
    const block = `### EOD sent on ${eod.date}\n${eod.plainText.trim()}`
    if (used + block.length > PAST_EOD_BUDGET) {
      const remaining = PAST_EOD_BUDGET - used
      if (remaining > 500) blocks.push(trimToBudget(block, remaining))
      break
    }
    blocks.push(block)
    used += block.length
  }
  return blocks.length > 0 ? blocks.join("\n\n") : "(no past EODs available)"
}

// ── GATHER prompt ─────────────────────────────────────────────────────────────

export interface GatherContext {
  todayDate: string // YYYY-MM-DD
  digests: SessionDigest[]
  git: RepoEvidence[]
  meetings: Array<{ title: string; durationMin: number }>
  ticketIndex: TicketIndexEntry[]
  /** Per-run user notes — authoritative facts/corrections for today. */
  notes: string
  /** Standing instructions doc (style rules + declared recurring work). */
  instructions: string
  /** Tool-free rerun after the agentic attempt failed: analyse the evidence
   *  already in this prompt and nothing else. */
  offline?: boolean
}

export function buildGatherPrompt(ctx: GatherContext): string {
  const sessionBudget = Math.max(
    MIN_SESSION_BUDGET,
    Math.min(
      MAX_SESSION_BUDGET,
      Math.floor(TOTAL_DIGEST_BUDGET / Math.max(1, ctx.digests.length))
    )
  )
  const sessionsBlock =
    ctx.digests.length > 0
      ? ctx.digests
          .map((s, i) => formatSession(s, i, sessionBudget))
          .join("\n\n")
      : "(no Claude Code sessions found today — rely on git, Jira and meetings evidence)"

  const meetingsBlock =
    ctx.meetings.length > 0
      ? ctx.meetings
          .map((m) => `- ${m.title} (${m.durationMin} min)`)
          .join("\n")
      : "(no meetings today)"

  const ticketIndexBlock =
    ctx.ticketIndex.length > 0
      ? ctx.ticketIndex.map((t) => `- ${t.key} - ${t.title}`).join("\n")
      : "(none)"

  const notesBlock = ctx.notes.trim()
    ? `━━━ EVIDENCE E — USER-DECLARED FACTS FOR TODAY (authoritative, highest priority) ━━━
${ctx.notes.trim()}

Rules for evidence E: anything the user states here is true evidence with source "user" — include it in the fact sheet even with no other trace. If the user says to skip/remove/ignore something (a meeting, a topic, a ticket), OMIT it from the fact sheet entirely.

`
    : ""

  const instructionsBlock = ctx.instructions.trim()
    ? `━━━ USER STANDING INSTRUCTIONS ━━━
${ctx.instructions.trim()}

Rules for standing instructions: declarations of recurring work (e.g. "always include KEY-123 as WIP regression testing") become fact-sheet tickets with source "user". Statements that something must never be reported mean: omit it from the fact sheet. Pure style/phrasing rules are for a later writing step — ignore them here.

`
    : ""

  // The agentic run may query Jira. The offline rerun has no tools at all, so
  // asking it to "try Jira" only invites it to pretend it did.
  const tasksBlock = ctx.offline
    ? `━━━ YOUR TASKS ━━━
1. From evidence A and B, identify every distinct piece of work done today and the ticket keys involved (branch names like "ATON-7632-fix-quota" and prompts/commits usually contain them).
2. You have NO tools on this run. Do not attempt Jira or any other lookup — every fact must come from the evidence above. Take a ticket title from evidence D when a key matches (titleSource "pastEod"); otherwise leave the key as the title (titleSource "branch-only"). Never use titleSource "jira".
3. Produce the FACT SHEET as JSON.`
    : `━━━ YOUR TASKS ━━━
1. From evidence A and B, identify every distinct piece of work done today and the ticket keys involved (branch names like "ATON-7632-fix-quota" and prompts/commits usually contain them).
2. If Atlassian/Jira MCP tools are available, cross-reference:
   - Search: JQL \`assignee = currentUser() AND updated >= -1d ORDER BY updated DESC\`
   - Also fetch by key any ticket seen in evidence but missing from that search, to get its exact title and status.
   If the MCP is unavailable or errors, continue using titles from evidence D (mark titleSource accordingly).
   Jira is your only lookup: you have no shell and no file access on this run.
3. Produce the FACT SHEET as JSON.`

  return `${TRACCIA_EOD_SENTINEL} Automated work-evidence analysis for an End-of-Day status report. Today is ${ctx.todayDate}.

You are a meticulous analyst reconstructing exactly what this engineer worked on TODAY from hard evidence. Be precise; never speculate.

━━━ EVIDENCE A — Claude Code session digests from today ━━━
${sessionsBlock}

━━━ EVIDENCE B — Git activity today ━━━
${formatGitEvidence(ctx.git)}

━━━ EVIDENCE C — Meetings attended today (context for mapping work to tickets; never an output) ━━━
${meetingsBlock}

━━━ EVIDENCE D — Ticket-title index from this user's past EODs ━━━
${ticketIndexBlock}

${notesBlock}${instructionsBlock}${tasksBlock}

━━━ FACT SHEET JSON SCHEMA ━━━
{
  "tickets": [{
    "key": "ATON-7632",
    "title": "exact ticket title",
    "titleSource": "jira" | "pastEod" | "branch-only",
    "statusSignal": "done" | "wip",
    "statusEvidence": "short reason, e.g. 'PR #123 opened 16:40' or 'still debugging at end of last session'",
    "actions": [{ "text": "specific thing done today within this ticket", "source": "session" | "git" | "jira" }]
  }],
  "unmatchedWork": ["work evident today that maps to no ticket key", ...]
}

━━━ HARD RULES ━━━
- Meetings are context only. Never output a meeting as a ticket, an action or unmatched work — Traccia adds attended meetings to the report itself. Use them only to work out which ticket a piece of work belongs to.
- This is a READ-ONLY analysis: never create, transition or comment on anything in Jira — only search and read.
- NEVER invent a ticket key or title. Every key must literally appear in evidence A (sessions), B (git), or Jira results. Work you cannot map to a real key goes in "unmatchedWork".
- Evidence D (past-EOD index) is TITLE LOOKUP ONLY. Use it to fill in the title for a key already found in A, B, or Jira. A key that appears ONLY in evidence D and has NO trace in today's sessions, git, or Jira MUST NOT be included in the tickets array — it is stale history, not today's work.
- Each action text must be concrete and traceable to evidence (what was analysed/fixed/added/tested), 5–20 words.
- 2–6 actions per ticket. Merge near-duplicate actions.
- statusSignal "done" only with completion evidence (ticket transitioned to a done state in Jira, or explicit completion in the session/commits); otherwise "wip".
- Final response: ONLY the JSON object. No markdown fences, no commentary.`
}

// ── WRITE prompt ──────────────────────────────────────────────────────────────

export interface WriteContext {
  todayDate: string
  factSheet: EodFactSheet
  pastEods: Array<{ date: string; plainText: string }>
  /** Standing instructions doc — style rules win over the default format rules. */
  instructions: string
  /** Per-run user notes (already absorbed into the fact sheet by the gather
   *  phase, repeated here so phrasing/tone wishes also reach the writer). */
  notes: string
}

function userRulesBlock(instructions: string, notes: string): string {
  const parts: string[] = []
  if (instructions.trim()) parts.push(instructions.trim())
  if (notes.trim()) parts.push(`Today's notes from the user:\n${notes.trim()}`)
  if (parts.length === 0) return ""
  return `━━━ USER RULES — these override ALL default rules below whenever they conflict ━━━
${parts.join("\n\n")}

`
}

export function buildWritePrompt(ctx: WriteContext): string {
  return `${TRACCIA_EOD_SENTINEL} Write today's (${ctx.todayDate}) End-of-Day status email content for this engineer, in their EXACT personal style. No tools are needed for this task — write directly from the material below.

━━━ VERIFIED FACT SHEET (the only source of truth for what happened today) ━━━
${JSON.stringify(ctx.factSheet, null, 2)}

━━━ PAST EODs — style fingerprint. Mimic the structure, tone, granularity, vocabulary and section conventions of these exactly ━━━
${formatPastEods(ctx.pastEods)}

${userRulesBlock(ctx.instructions, ctx.notes)}━━━ FORMAT RULES ━━━
- Task line: "KEY - exact ticket title → WIP" or "→ Done" (use the fact sheet's statusSignal).
- Sub-bullets: past tense, 3–10 words each, management-friendly (no code-level jargon), 2–5 per ticket, derived only from the fact sheet's actions.
- Meetings: do NOT output any meeting lines (no "Attended meeting: ..." entries). Traccia inserts attended meetings automatically after you finish. The past-EOD examples below contain meeting lines — mimic their style, never their meeting entries.
- Group tickets under the correct project name (derive from the ticket key prefix and past EODs).
- Project status: "green" unless evidence clearly says otherwise.
- REQUIRED: "unmatchedWork" items represent real work done today with no ticket key. If unmatchedWork is non-empty, every item MUST appear in otherTasks.items, phrased like the user would. Setting otherTasks.isNA:true when unmatchedWork is non-empty is a critical error — the user's work becomes invisible.
- nextDayPlan: continue WIP tickets, phrased like in past EODs (e.g. "Working on ticket KEY"). If nothing is WIP, use a sensible short plan.
- concerns: leave as N/A (isNA: true, empty items) unless past EODs show a recurring concern pattern that clearly still applies.
- upcomingHolidays: ALWAYS isNA true with empty items. The app injects approved leave automatically — never write holiday or leave entries yourself.
- Empty sections: isNA true with empty items — never invent content to fill space.

━━━ OUTPUT JSON SCHEMA (exact shape, nothing more) ━━━
{
  "projects": [{
    "name": "ATON",
    "status": "green",
    "statusNote": null,
    "tasksCompleted": [{ "text": "KEY - title → WIP", "subBullets": [{ "text": "..." }] }]
  }],
  "otherTasks": { "items": [{ "text": "..." }], "isNA": false },
  "concerns": { "items": [], "isNA": true },
  "nextDayPlan": { "items": [{ "text": "..." }], "isNA": false },
  "upcomingHolidays": { "items": [], "isNA": true }
}

Final response: ONLY the JSON object. No markdown fences, no commentary.`
}

// ── REFINE prompt ─────────────────────────────────────────────────────────────
// Write-phase-only rerun: revise an existing draft per one user instruction.
// No past EODs needed — the previous draft already carries the style.

export interface RefineContext {
  todayDate: string
  factSheet: EodFactSheet
  previousDraft: unknown
  instruction: string
  instructions: string
}

export function buildRefinePrompt(ctx: RefineContext): string {
  return `${TRACCIA_EOD_SENTINEL} Revise an existing End-of-Day draft (${ctx.todayDate}) for this engineer. No tools are needed — revise directly.

━━━ PREVIOUS DRAFT (JSON) ━━━
${JSON.stringify(ctx.previousDraft, null, 2)}

━━━ REFINEMENT REQUEST — apply EXACTLY this change and keep everything else identical ━━━
${ctx.instruction.trim()}

━━━ FACT SHEET (the only source of truth — never add content beyond it) ━━━
${JSON.stringify(ctx.factSheet, null, 2)}

${userRulesBlock(ctx.instructions, "")}━━━ RULES ━━━
- Apply the refinement request faithfully; do not "improve" unrelated parts.
- Never invent ticket keys, titles or work that is not in the fact sheet or the refinement request.
- Keep the exact same output JSON shape as the previous draft (projects / otherTasks / concerns / nextDayPlan / upcomingHolidays).
- Empty sections: isNA true with empty items.

Final response: ONLY the revised JSON object. No markdown fences, no commentary.`
}
