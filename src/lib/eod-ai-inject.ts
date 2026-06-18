// Merging a selected subset of an AI-generated draft into the Power Composer form.
//
// The AI owns the narrative (projects, tasks, concerns, next-day plan) and never
// emits meetings or leaves — those are deterministic system items carried by
// `meetingKey` / `leaveKey`. The picker hands us a form-shaped `subset` of just
// the chosen work; this merges it onto the current form.
//
//   additive (default) : keep the whole form, append the subset
//   replace            : strip the form back to its system items (meetings /
//                        leaves) only, then append the subset
//
// Either way meetings/leaves survive. Pure + synchronous; nothing is mutated.

import type { EodFormState, EodSectionItem, EodTask } from './eod-types'
import { makeEmptyProject, makeId } from './eod-types'

const WORK_SECTIONS = [
  'otherTasks', 'concerns', 'nextDayPlan',
] as const satisfies ReadonlyArray<keyof EodFormState>

function sameName(a: string, b: string): boolean {
  return a.trim() !== '' && a.trim().toLowerCase() === b.trim().toLowerCase()
}

// Fresh ids on every merged node — the form requires unique ids, and a forced
// re-add of the same draft item must not collide with the copy already present.
function freshTask(t: EodTask): EodTask {
  const out: EodTask = {
    id: makeId(),
    text: t.text,
    subBullets: t.subBullets.map(s => ({ id: makeId(), text: s.text })),
  }
  if (t.meetingKey) out.meetingKey = t.meetingKey
  return out
}

function freshItem(i: EodSectionItem): EodSectionItem {
  const out: EodSectionItem = { id: makeId(), text: i.text }
  if (i.meetingKey) out.meetingKey = i.meetingKey
  if (i.leaveKey) out.leaveKey = i.leaveKey
  return out
}

/** Strip the form back to its system items (keyed meetings + leaves) only. */
function keepSystemOnly(form: EodFormState): EodFormState {
  const projects = form.projects
    .map(p => ({ ...p, tasksCompleted: p.tasksCompleted.filter(t => t.meetingKey) }))
    .filter(p => p.tasksCompleted.length > 0)

  let next: EodFormState = { ...form, projects }
  for (const sk of WORK_SECTIONS) {
    const items = form[sk].items.filter(i => i.meetingKey)
    next = { ...next, [sk]: { items, isNA: items.length === 0 } }
  }
  const leaves = form.upcomingHolidays.items.filter(i => i.leaveKey)
  next = { ...next, upcomingHolidays: { items: leaves, isNA: leaves.length === 0 } }
  return next
}

export function mergeSelected(
  form: EodFormState,
  subset: EodFormState,
  opts: { replace: boolean },
): EodFormState {
  let next = opts.replace ? keepSystemOnly(form) : form
  let reusedEmpty = false

  for (const sp of subset.projects) {
    const match = next.projects.find(p => sameName(p.name, sp.name))
    if (match) {
      // Append tasks; keep the user's existing status/note untouched.
      next = {
        ...next,
        projects: next.projects.map(p =>
          p.id === match.id
            ? { ...p, tasksCompleted: [...p.tasksCompleted, ...sp.tasksCompleted.map(freshTask)] }
            : p,
        ),
      }
      continue
    }

    // No match: reuse the lone empty default project for the first incoming
    // project, otherwise create a new one carrying the AI's name/status/note.
    const emptyIdx = reusedEmpty
      ? -1
      : next.projects.findIndex(p => p.name.trim() === '' && p.tasksCompleted.length === 0)
    if (emptyIdx >= 0) {
      reusedEmpty = true
      next = {
        ...next,
        projects: next.projects.map((p, i) =>
          i === emptyIdx
            ? { ...p, name: sp.name, status: sp.status, statusNote: sp.statusNote, tasksCompleted: sp.tasksCompleted.map(freshTask) }
            : p,
        ),
      }
    } else {
      next = {
        ...next,
        projects: [
          ...next.projects,
          { id: makeId(), name: sp.name, status: sp.status, statusNote: sp.statusNote, tasksCompleted: sp.tasksCompleted.map(freshTask) },
        ],
      }
    }
  }

  for (const sk of WORK_SECTIONS) {
    const add = subset[sk].items
    if (add.length === 0) continue
    next = { ...next, [sk]: { isNA: false, items: [...next[sk].items, ...add.map(freshItem)] } }
  }

  // Never leave the form with zero projects (dnd + routing need a container).
  if (next.projects.length === 0) next = { ...next, projects: [makeEmptyProject()] }

  return next
}
