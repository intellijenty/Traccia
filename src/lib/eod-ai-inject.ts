// Graceful injection of AI-generated drafts into the Power Composer form.
//
// The AI owns the narrative (projects, tasks, concerns, next-day plan) and is
// instructed never to emit meeting or leave lines. Meetings and leaves are
// deterministic system data carried by `meetingKey` / `leaveKey`. This util
// composes the two: it takes the keyless AI draft as the new base, strips any
// stray system lines the model emitted anyway, then carries the keyed meeting
// and leave items from the CURRENT form (already reconciled by mount-sync) back
// onto the base — preserving the user's curated placement without re-fetching.
//
// Pure + synchronous: a single atomic result, so the form commit and the dialog
// preview never flicker and always agree (what-you-see-is-what-you-send).

import type { EodFormState, EodSectionItem, EodTask } from './eod-types'
import { makeEmptyProject } from './eod-types'

// Sections that can hold system-imported meeting items (mirrors eod-meeting-sync).
const MEETING_SECTIONS = [
  'otherTasks', 'concerns', 'nextDayPlan', 'upcomingHolidays',
] as const satisfies ReadonlyArray<keyof EodFormState>

const ATTENDED_RX = /^\s*attended meeting\s*:/i

/**
 * Compose the AI draft (`base`) with the keyed system items from the current
 * form (`source`). Returns a new form state; neither input is mutated.
 */
export function injectSystemItems(base: EodFormState, source: EodFormState): EodFormState {
  // 1. Strip any meeting lines the model emitted despite instructions.
  let next: EodFormState = {
    ...base,
    projects: base.projects.map(p => ({
      ...p,
      tasksCompleted: p.tasksCompleted.filter(t => !ATTENDED_RX.test(t.text)),
    })),
  }
  for (const sk of MEETING_SECTIONS) {
    next = {
      ...next,
      [sk]: { ...next[sk], items: next[sk].items.filter(i => !ATTENDED_RX.test(i.text)) },
    }
  }

  // 2. The system owns leaves entirely — discard whatever the model put here.
  next = { ...next, upcomingHolidays: { items: [], isNA: true } }

  // 3. Backfill one empty project so routing + dnd never hit an empty container.
  if (next.projects.length === 0) {
    next = { ...next, projects: [makeEmptyProject()] }
  }

  // 4a. Carry section meeting items back into their original section.
  for (const sk of MEETING_SECTIONS) {
    const carried = source[sk].items.filter(i => i.meetingKey)
    if (carried.length === 0) continue
    next = {
      ...next,
      [sk]: { isNA: false, items: [...next[sk].items, ...carried.map(cloneSectionItem)] },
    }
  }

  // 4b. Carry project-attached meeting tasks back, matched by project name
  //     (case-insensitive). No match → fall back to otherTasks.
  const orphanMeetingTasks: EodTask[] = []
  for (const sp of source.projects) {
    const meetingTasks = sp.tasksCompleted.filter(t => t.meetingKey)
    if (meetingTasks.length === 0) continue
    const target = next.projects.find(
      p => p.name.trim().toLowerCase() === sp.name.trim().toLowerCase() && sp.name.trim() !== '',
    )
    if (target) {
      next = {
        ...next,
        projects: next.projects.map(p =>
          p.id === target.id
            ? { ...p, tasksCompleted: [...p.tasksCompleted, ...meetingTasks.map(cloneTask)] }
            : p,
        ),
      }
    } else {
      orphanMeetingTasks.push(...meetingTasks)
    }
  }
  if (orphanMeetingTasks.length > 0) {
    const asItems: EodSectionItem[] = orphanMeetingTasks.map(t => ({
      id: t.id,
      text: t.text,
      ...(t.meetingKey ? { meetingKey: t.meetingKey } : {}),
    }))
    next = {
      ...next,
      otherTasks: { isNA: false, items: [...next.otherTasks.items, ...asItems] },
    }
  }

  // 4c. Carry leave ranges back into upcomingHolidays.
  const carriedLeaves = source.upcomingHolidays.items.filter(i => i.leaveKey)
  if (carriedLeaves.length > 0) {
    next = {
      ...next,
      upcomingHolidays: { isNA: false, items: carriedLeaves.map(cloneSectionItem) },
    }
  }

  return next
}

function cloneSectionItem(i: EodSectionItem): EodSectionItem {
  const out: EodSectionItem = { id: i.id, text: i.text }
  if (i.meetingKey) out.meetingKey = i.meetingKey
  if (i.leaveKey) out.leaveKey = i.leaveKey
  return out
}

function cloneTask(t: EodTask): EodTask {
  const out: EodTask = {
    id: t.id,
    text: t.text,
    subBullets: t.subBullets.map(s => ({ id: s.id, text: s.text })),
  }
  if (t.meetingKey) out.meetingKey = t.meetingKey
  return out
}
