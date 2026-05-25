import type { EodFormState, EodSectionItem } from './eod-types'
import { makeId } from './eod-types'
import type { OutlookMeeting } from './outlook-meetings'
import type { EodMeetingsSettings, MeetingRule, MeetingRouteTarget } from './eod-meetings-settings'

// Sections that can hold system-imported meeting items
const ALL_MEETING_SECTIONS = [
  'otherTasks', 'concerns', 'nextDayPlan', 'upcomingHolidays',
] as const satisfies ReadonlyArray<keyof EodFormState>

// ── Identity ──────────────────────────────────────────────────────────────────

/** Derives a stable, date-agnostic key from a meeting.
 *  The same recurring meeting on different days produces the same key. */
export function deriveMeetingKey(m: OutlookMeeting): string {
  const d = new Date(m.start)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const title = m.title.trim().toLowerCase().replace(/\s+/g, ' ')
  return `${hh}:${mm}@${m.duration}@${title}`
}

// ── Pre-filter ────────────────────────────────────────────────────────────────

export function filterMeetings(meetings: OutlookMeeting[]): OutlookMeeting[] {
  if (!Array.isArray(meetings)) return []
  return meetings.filter(m =>
    m.responseStatus !== 4 &&   // exclude Declined
    m.duration >= 5 &&           // exclude sub-5-min calendar artifacts
    m.duration < 480 &&          // exclude all-day events (≥ 8 hours)
    m.title.trim().length > 0    // exclude blank titles
  )
}

// ── Formatting ────────────────────────────────────────────────────────────────

function formatHours(minutes: number): string {
  return String(Math.round((minutes / 60) * 4) / 4)
}

export function formatMeetingText(m: OutlookMeeting, attachDuration: boolean): string {
  const base = `Attended meeting: ${m.title.trim()}`
  if (!attachDuration) return base
  return `${base} (${formatHours(m.duration)} Hr)`
}

// ── Classification ────────────────────────────────────────────────────────────

type ClassificationResult = {
  target: MeetingRouteTarget
  projectName?: string
}

export function classifyMeeting(title: string, rules: MeetingRule[]): ClassificationResult {
  const lower = title.trim().toLowerCase()
  for (const rule of rules) {
    const matched = rule.keywords.some(kw => {
      const k = kw.trim().toLowerCase()
      return k && lower.includes(k)
    })
    if (matched) return { target: rule.target, projectName: rule.projectName }
  }
  return { target: 'otherTasks' }
}

// ── Cross-section key inventory ───────────────────────────────────────────────

function getAllMeetingKeys(state: EodFormState): Set<string> {
  const keys = new Set<string>()
  for (const sk of ALL_MEETING_SECTIONS) {
    state[sk].items.forEach(i => i.meetingKey && keys.add(i.meetingKey))
  }
  state.projects.forEach(p =>
    p.tasksCompleted.forEach(t => t.meetingKey && keys.add(t.meetingKey))
  )
  return keys
}

// ── Reconciliation ────────────────────────────────────────────────────────────

export function applyMeetingSync(
  state: EodFormState,
  rawIncoming: OutlookMeeting[],
  settings: Pick<EodMeetingsSettings, 'attachDuration' | 'excludeKeywords' | 'rules'>,
): EodFormState {
  const excludes = settings.excludeKeywords.map(k => k.trim().toLowerCase()).filter(Boolean)
  const incoming = filterMeetings(rawIncoming).filter(m => {
    const lower = m.title.trim().toLowerCase()
    return !excludes.some(kw => lower.includes(kw))
  })
  const incomingKeys = new Set(incoming.map(deriveMeetingKey))

  // Step 1: remove stale system items from all sections and all projects
  let next: EodFormState = state
  for (const sk of ALL_MEETING_SECTIONS) {
    next = {
      ...next,
      [sk]: {
        ...next[sk],
        items: next[sk].items.filter(i => !i.meetingKey || incomingKeys.has(i.meetingKey)),
      },
    }
  }
  next = {
    ...next,
    projects: next.projects.map(p => ({
      ...p,
      tasksCompleted: p.tasksCompleted.filter(t => !t.meetingKey || incomingKeys.has(t.meetingKey)),
    })),
  }

  // Step 2: find already-present meeting keys after stale removal
  const presentKeys = getAllMeetingKeys(next)

  // Step 3: add new meetings to their classified destinations, sorted by start time
  const toAdd = incoming
    .filter(m => !presentKeys.has(deriveMeetingKey(m)))
    .sort((a, b) => a.start.localeCompare(b.start))

  for (const m of toAdd) {
    const key = deriveMeetingKey(m)
    const text = formatMeetingText(m, settings.attachDuration)
    const cls = classifyMeeting(m.title, settings.rules)

    if (cls.target === 'project') {
      const pName = cls.projectName?.trim()
      const targetProject = pName
        ? next.projects.find(p => p.name.trim().toLowerCase() === pName.toLowerCase())
        : next.projects.length === 1
          ? next.projects[0]
          : undefined  // multiple projects + no name → fallback to otherTasks

      if (!targetProject) {
        const newItem: EodSectionItem = { id: makeId(), text, meetingKey: key }
        next = { ...next, otherTasks: { isNA: false, items: [...next.otherTasks.items, newItem] } }
      } else {
        next = {
          ...next,
          projects: next.projects.map(p =>
            p.id === targetProject.id
              ? { ...p, tasksCompleted: [...p.tasksCompleted, { id: makeId(), text, subBullets: [], meetingKey: key }] }
              : p
          ),
        }
      }
    } else {
      const newItem: EodSectionItem = { id: makeId(), text, meetingKey: key }
      next = { ...next, otherTasks: { isNA: false, items: [...next.otherTasks.items, newItem] } }
    }
  }

  return next
}
