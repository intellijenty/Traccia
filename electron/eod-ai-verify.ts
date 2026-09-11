// Deterministic post-processing for AI EOD generation: robust JSON extraction
// from model output, defensive shape coercion, and the anti-hallucination
// checks.
//
// There are two of those checks, at two different stages, because there are two
// different things the model can invent:
//
//   screenFactSheet  guards the GATHER phase against reporting a ticket that
//                    exists in no evidence we collected. Without it the draft
//                    verifier is checking the writer against the analyst and
//                    nothing is ever checking the analyst — a stale key lifted
//                    from the past-EOD title index gets rubber-stamped.
//   verifyDraft      guards the WRITE phase against inventing a key the fact
//                    sheet does not contain.

import type {
  EodAiDraft,
  EodFactSheet,
  EodFactTicket,
} from "../src/lib/eod-ai-types"
import { extractTicketKeys } from "./eod-ai-keys"

// ── JSON extraction ───────────────────────────────────────────────────────────

/**
 * Pull the first complete JSON object out of model output. Handles fenced
 * blocks, leading/trailing prose, and braces inside string values (a naive
 * greedy brace regex breaks on all of those).
 *
 * Only a fallback now that both phases run with --json-schema and get validated
 * output back; kept for older CLI builds that ignore the flag.
 */
export function extractJson(raw: string): unknown | null {
  if (typeof raw !== "string" || !raw.trim()) return null

  // Prefer an explicit ```json fence if present
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidates = fence ? [fence[1], raw] : [raw]

  for (const text of candidates) {
    const start = text.indexOf("{")
    if (start === -1) continue

    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === "\\") {
        if (inString) escaped = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        continue
      }
      if (inString) continue
      if (ch === "{") depth++
      else if (ch === "}") {
        depth--
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1))
          } catch {
            break // malformed — try next candidate
          }
        }
      }
    }
  }
  return null
}

// ── Coercion helpers ──────────────────────────────────────────────────────────

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.trim() : fallback
}

function asItems(v: unknown): Array<{ text: string }> {
  if (!Array.isArray(v)) return []
  return v
    .map((item) => {
      if (typeof item === "string") return { text: item.trim() }
      if (item && typeof item === "object")
        return { text: asString((item as { text?: unknown }).text) }
      return { text: "" }
    })
    .filter((i) => i.text.length > 0)
}

/** The items of a simple section, whatever shape the model wrapped them in. */
function sectionItems(v: unknown): Array<{ text: string }> {
  const obj = (v && typeof v === "object" ? v : {}) as { items?: unknown }
  return asItems(obj.items)
}

// ── Fact sheet coercion ───────────────────────────────────────────────────────

/**
 * Defensive coercion of the gather phase's output into a usable fact sheet.
 * Returns null only when the input is not a fact sheet at all; a well-formed
 * but empty one comes back empty, so the caller can tell "the model produced
 * garbage" apart from "the analysis found nothing", which are different
 * failures with different fixes.
 */
export function coerceFactSheet(parsed: unknown): EodFactSheet | null {
  if (!parsed || typeof parsed !== "object") return null
  const obj = parsed as { tickets?: unknown; unmatchedWork?: unknown }

  const tickets: EodFactTicket[] = []
  if (Array.isArray(obj.tickets)) {
    for (const t of obj.tickets) {
      if (!t || typeof t !== "object") continue
      const ticket = t as Record<string, unknown>
      const key = asString(ticket.key).toUpperCase()
      if (!/^[A-Z][A-Z0-9]{1,9}-\d{1,6}$/.test(key)) continue
      tickets.push({
        key,
        title: asString(ticket.title, key),
        titleSource: asString(ticket.titleSource, "unknown"),
        statusSignal: asString(ticket.statusSignal) === "done" ? "done" : "wip",
        statusEvidence: asString(ticket.statusEvidence),
        actions: Array.isArray(ticket.actions)
          ? ticket.actions
              .map((a) => {
                if (typeof a === "string")
                  return { text: a.trim(), source: "unknown" }
                if (a && typeof a === "object") {
                  const act = a as { text?: unknown; source?: unknown }
                  return {
                    text: asString(act.text),
                    source: asString(act.source, "unknown"),
                  }
                }
                return { text: "", source: "unknown" }
              })
              .filter((a) => a.text.length > 0)
          : [],
      })
    }
  }

  const unmatchedWork = Array.isArray(obj.unmatchedWork)
    ? obj.unmatchedWork.filter(
        (m): m is string => typeof m === "string" && m.trim().length > 0
      )
    : []

  return { tickets, unmatchedWork }
}

/** Nothing for the writer to work from. */
export function isEmptyFactSheet(factSheet: EodFactSheet): boolean {
  return factSheet.tickets.length === 0 && factSheet.unmatchedWork.length === 0
}

// ── Fact sheet screening (gather phase) ───────────────────────────────────────

export interface ScreenOptions {
  /** Keys that literally appear in the session digests or git evidence. */
  evidenceKeys: ReadonlySet<string>
  /** Keys the user declared in instructions or notes. */
  declaredKeys: readonly string[]
  /** Whether the analyst actually invoked a Jira/Atlassian tool this run. */
  jiraConsulted: boolean
  /** Project codes learned from the user's own history — see eod-ai-keys. */
  knownPrefixes?: ReadonlySet<string>
}

export interface ScreenResult {
  factSheet: EodFactSheet
  /** "KEY - title" for every ticket removed for lack of any evidence. */
  droppedTickets: string[]
}

/**
 * Drop fact-sheet tickets that no evidence supports.
 *
 * A ticket survives when its key appears in the evidence we gathered ourselves,
 * when the user declared it, or when the analyst says it came from Jira AND a
 * Jira tool was genuinely invoked this run. That last clause is deliberate:
 * work done entirely inside Jira (a status transition, a comment, manual QA)
 * leaves no local trace and is still real work. It is also the weakest link —
 * `titleSource` is self-reported, so a model that queried Jira at all could
 * still attach the label to a stale key. Requiring a real tool call closes the
 * common case (MCP unavailable, so every "jira" claim is provably false)
 * without discarding legitimate Jira-only work.
 */
export function screenFactSheet(
  factSheet: EodFactSheet,
  opts: ScreenOptions
): ScreenResult {
  const declared = new Set(opts.declaredKeys.map((k) => k.toUpperCase()))
  const tickets: EodFactTicket[] = []
  const droppedTickets: string[] = []

  for (const ticket of factSheet.tickets) {
    const key = ticket.key.toUpperCase()
    const backed =
      opts.evidenceKeys.has(key) ||
      declared.has(key) ||
      (opts.jiraConsulted && ticket.titleSource === "jira")
    if (backed) tickets.push(ticket)
    else droppedTickets.push(`${ticket.key} - ${ticket.title}`)
  }

  return { factSheet: { ...factSheet, tickets }, droppedTickets }
}

// ── Draft verification (write phase) ──────────────────────────────────────────

export interface VerifyResult {
  draft: EodAiDraft
  /** Lines removed because they name a ticket the fact sheet does not contain. */
  dropped: string[]
}

/**
 * Coerce the write phase's output into a valid draft and enforce the
 * anti-hallucination rule: any line naming a ticket key that is absent from the
 * fact sheet is dropped (and reported). Keys the user declared themselves are
 * passed as extraAllowedKeys — a user declaration counts as evidence.
 *
 * Every key on a line is checked, not just one at the start: "Continued work on
 * ATON-9999 quota" is exactly the shape stale history leaks in as, and an
 * anchored check never saw it.
 */
export function verifyDraft(
  parsed: unknown,
  factSheet: EodFactSheet,
  extraAllowedKeys: readonly string[] = [],
  knownPrefixes?: ReadonlySet<string>
): VerifyResult | null {
  if (!parsed || typeof parsed !== "object") return null
  const obj = parsed as Record<string, unknown>

  const allowedKeys = new Set([
    ...factSheet.tickets.map((t) => t.key.toUpperCase()),
    ...extraAllowedKeys.map((k) => k.toUpperCase()),
  ])
  const dropped: string[] = []
  const seenTaskTexts = new Set<string>()

  /** Keys on this line that nothing backs. Empty means the line is safe. */
  const unbackedKeys = (text: string): string[] =>
    extractTicketKeys(text, knownPrefixes).filter((k) => !allowedKeys.has(k))

  const projects: EodAiDraft["projects"] = []
  if (Array.isArray(obj.projects)) {
    for (const p of obj.projects) {
      if (!p || typeof p !== "object") continue
      const proj = p as Record<string, unknown>

      const tasksCompleted: EodAiDraft["projects"][number]["tasksCompleted"] =
        []
      if (Array.isArray(proj.tasksCompleted)) {
        for (const t of proj.tasksCompleted) {
          if (!t || typeof t !== "object") continue
          const task = t as Record<string, unknown>
          const text = asString(task.text)
          if (!text) continue

          if (unbackedKeys(text).length > 0) {
            dropped.push(text)
            continue
          }
          const dedupeKey = text.toLowerCase()
          if (seenTaskTexts.has(dedupeKey)) continue
          seenTaskTexts.add(dedupeKey)

          // A sub-bullet can name a stale ticket on its own; drop just the
          // sub-bullet rather than the whole task it hangs off.
          const subBullets: Array<{ text: string }> = []
          for (const sub of asItems(task.subBullets)) {
            if (unbackedKeys(sub.text).length > 0) dropped.push(sub.text)
            else subBullets.push(sub)
          }

          tasksCompleted.push({ text, subBullets })
        }
      }

      const name = asString(proj.name)
      if (!name && tasksCompleted.length === 0) continue

      const rawNote =
        typeof proj.statusNote === "string" && proj.statusNote.trim()
          ? proj.statusNote.trim()
          : null
      let statusNote = rawNote
      if (rawNote && unbackedKeys(rawNote).length > 0) {
        dropped.push(rawNote)
        statusNote = null
      }

      const statusRaw = asString(proj.status)
      projects.push({
        name: name || "Project",
        status:
          statusRaw === "yellow" || statusRaw === "red" || statusRaw === "none"
            ? statusRaw
            : "green",
        statusNote,
        tasksCompleted,
      })
    }
  }

  // Drop projects left with neither tasks nor a meaningful note
  const cleanedProjects = projects.filter(
    (p) => p.tasksCompleted.length > 0 || p.statusNote !== null
  )

  // Simple sections get the same treatment. A nextDayPlan item like "Working on
  // ATON-7632 quota work" with no fact-sheet backing is stale history leaking
  // in from the past-EOD index.
  /**
   * isNA is derived, never trusted: it means "nothing to report", so it is
   * exactly `items.length === 0`. The model regularly contradicts itself here,
   * and filtering can empty a section that arrived marked not-N/A, which would
   * otherwise render as a section that is present but blank. Computed in this
   * one place so the two cannot drift.
   */
  function filterSection(raw: unknown): {
    items: Array<{ text: string }>
    isNA: boolean
  } {
    const kept: Array<{ text: string }> = []
    for (const item of sectionItems(raw)) {
      if (unbackedKeys(item.text).length > 0) dropped.push(item.text)
      else kept.push(item)
    }
    return { items: kept, isNA: kept.length === 0 }
  }

  const draft: EodAiDraft = {
    projects: cleanedProjects,
    otherTasks: filterSection(obj.otherTasks),
    concerns: filterSection(obj.concerns),
    nextDayPlan: filterSection(obj.nextDayPlan),
    upcomingHolidays: filterSection(obj.upcomingHolidays),
  }

  // Usable if it carries ANY content. A day of only non-ticket work (everything
  // in otherTasks, no project tickets) is a perfectly valid EOD — don't reject it.
  const hasContent =
    cleanedProjects.length > 0 ||
    draft.otherTasks.items.length > 0 ||
    draft.concerns.items.length > 0 ||
    draft.nextDayPlan.items.length > 0 ||
    draft.upcomingHolidays.items.length > 0
  if (!hasContent && dropped.length === 0) return null

  return { draft, dropped }
}
