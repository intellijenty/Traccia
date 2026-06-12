// Deterministic post-processing for AI EOD generation: robust JSON extraction
// from model output, defensive shape coercion, and the anti-hallucination
// check (every ticket key in the draft must exist in the fact sheet).

import type { EodAiDraft, EodFactSheet, EodFactTicket } from '../src/lib/eod-ai-types'

const TICKET_KEY_RX = /^([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/

// ── JSON extraction ───────────────────────────────────────────────────────────

/**
 * Pull the first complete JSON object out of model output. Handles fenced
 * blocks, leading/trailing prose, and braces inside string values (a naive
 * /\{[\s\S]*\}/ regex breaks on all of those).
 */
export function extractJson(raw: string): unknown | null {
  if (typeof raw !== 'string' || !raw.trim()) return null

  // Prefer an explicit ```json fence if present
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidates = fence ? [fence[1], raw] : [raw]

  for (const text of candidates) {
    const start = text.indexOf('{')
    if (start === -1) continue

    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { if (inString) escaped = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') depth++
      else if (ch === '}') {
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

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback
}

function asItems(v: unknown): Array<{ text: string }> {
  if (!Array.isArray(v)) return []
  return v
    .map(item => {
      if (typeof item === 'string') return { text: item.trim() }
      if (item && typeof item === 'object') return { text: asString((item as { text?: unknown }).text) }
      return { text: '' }
    })
    .filter(i => i.text.length > 0)
}

function asSection(v: unknown, defaultNA: boolean): { items: Array<{ text: string }>; isNA: boolean } {
  const obj = (v && typeof v === 'object' ? v : {}) as { items?: unknown; isNA?: unknown }
  const items = asItems(obj.items)
  // isNA must be consistent with content: items present → not N/A
  const isNA = items.length > 0 ? false : typeof obj.isNA === 'boolean' ? obj.isNA : defaultNA
  return { items, isNA }
}

// ── Fact sheet coercion ───────────────────────────────────────────────────────

/** Defensive coercion of the gather phase's output into a usable fact sheet. */
export function coerceFactSheet(parsed: unknown): EodFactSheet | null {
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as { tickets?: unknown; meetings?: unknown; unmatchedWork?: unknown }

  const tickets: EodFactTicket[] = []
  if (Array.isArray(obj.tickets)) {
    for (const t of obj.tickets) {
      if (!t || typeof t !== 'object') continue
      const ticket = t as Record<string, unknown>
      const key = asString(ticket.key).toUpperCase()
      if (!/^[A-Z][A-Z0-9]{1,9}-\d{1,6}$/.test(key)) continue
      tickets.push({
        key,
        title: asString(ticket.title, key),
        titleSource: asString(ticket.titleSource, 'unknown'),
        statusSignal: asString(ticket.statusSignal) === 'done' ? 'done' : 'wip',
        statusEvidence: asString(ticket.statusEvidence),
        actions: Array.isArray(ticket.actions)
          ? ticket.actions
              .map(a => {
                if (typeof a === 'string') return { text: a.trim(), source: 'unknown' }
                if (a && typeof a === 'object') {
                  const act = a as { text?: unknown; source?: unknown }
                  return { text: asString(act.text), source: asString(act.source, 'unknown') }
                }
                return { text: '', source: 'unknown' }
              })
              .filter(a => a.text.length > 0)
          : [],
      })
    }
  }

  const meetings = Array.isArray(obj.meetings)
    ? obj.meetings.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    : []
  const unmatchedWork = Array.isArray(obj.unmatchedWork)
    ? obj.unmatchedWork.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    : []

  // A fact sheet with no signal at all is useless — treat as failure so the
  // orchestrator reports it instead of producing an empty email.
  if (tickets.length === 0 && meetings.length === 0 && unmatchedWork.length === 0) return null

  return { tickets, meetings, unmatchedWork }
}

// ── Draft verification ────────────────────────────────────────────────────────

export interface VerifyResult {
  draft: EodAiDraft
  /** Task texts removed because their ticket key has no evidence backing. */
  dropped: string[]
}

/**
 * Coerce the write phase's output into a valid draft and enforce the
 * anti-hallucination rule: any task line starting with a ticket key that is
 * absent from the fact sheet is dropped (and reported).
 */
export function verifyDraft(parsed: unknown, factSheet: EodFactSheet): VerifyResult | null {
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>

  const allowedKeys = new Set(factSheet.tickets.map(t => t.key.toUpperCase()))
  const dropped: string[] = []
  const seenTaskTexts = new Set<string>()

  const projects: EodAiDraft['projects'] = []
  if (Array.isArray(obj.projects)) {
    for (const p of obj.projects) {
      if (!p || typeof p !== 'object') continue
      const proj = p as Record<string, unknown>

      const tasksCompleted: EodAiDraft['projects'][number]['tasksCompleted'] = []
      if (Array.isArray(proj.tasksCompleted)) {
        for (const t of proj.tasksCompleted) {
          if (!t || typeof t !== 'object') continue
          const task = t as Record<string, unknown>
          const text = asString(task.text)
          if (!text) continue

          const keyMatch = TICKET_KEY_RX.exec(text.toUpperCase())
          if (keyMatch && !allowedKeys.has(keyMatch[1])) {
            dropped.push(text)
            continue
          }
          const dedupeKey = text.toLowerCase()
          if (seenTaskTexts.has(dedupeKey)) continue
          seenTaskTexts.add(dedupeKey)

          tasksCompleted.push({
            text,
            subBullets: asItems(task.subBullets),
          })
        }
      }

      const name = asString(proj.name)
      if (!name && tasksCompleted.length === 0) continue

      const statusRaw = asString(proj.status)
      projects.push({
        name: name || 'Project',
        status: statusRaw === 'yellow' || statusRaw === 'red' || statusRaw === 'none' ? statusRaw : 'green',
        statusNote: typeof proj.statusNote === 'string' && proj.statusNote.trim() ? proj.statusNote.trim() : null,
        tasksCompleted,
      })
    }
  }

  // Drop projects left with neither tasks nor a meaningful note
  const cleanedProjects = projects.filter(p => p.tasksCompleted.length > 0 || p.statusNote !== null)
  if (cleanedProjects.length === 0 && dropped.length === 0) {
    // Model produced no usable project content at all
    return null
  }

  const draft: EodAiDraft = {
    projects: cleanedProjects,
    otherTasks: asSection(obj.otherTasks, true),
    concerns: asSection(obj.concerns, true),
    nextDayPlan: asSection(obj.nextDayPlan, false),
    upcomingHolidays: asSection(obj.upcomingHolidays, true),
  }

  return { draft, dropped }
}
