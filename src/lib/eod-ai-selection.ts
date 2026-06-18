// Selection model for the AI draft picker.
//
// Pure helpers over a `Set<string>` of selected item ids (tasks, sub-bullets,
// section items — keyed by the ids in the displayed `result` form). Projects are
// containers: their checkbox is derived (all / some / none) and toggling one
// flips all its tasks. Sub-bullets can never be orphaned — selecting a sub also
// selects its parent task. Holidays are excluded (system-owned).

import type { EodFormState, EodTask } from './eod-types'

export const PICKER_SECTIONS = ['otherTasks', 'concerns', 'nextDayPlan'] as const
export type PickerSection = (typeof PICKER_SECTIONS)[number]

export type ProjectCheck = 'all' | 'some' | 'none'

function findTask(draft: EodFormState, taskId: string): EodTask | undefined {
  for (const p of draft.projects) {
    const t = p.tasksCompleted.find(t => t.id === taskId)
    if (t) return t
  }
  return undefined
}

/** Every selectable id in the draft — the all-checked default. */
export function allSelectableIds(draft: EodFormState): string[] {
  const ids: string[] = []
  for (const p of draft.projects) {
    for (const t of p.tasksCompleted) {
      ids.push(t.id)
      for (const s of t.subBullets) ids.push(s.id)
    }
  }
  for (const sk of PICKER_SECTIONS) for (const i of draft[sk].items) ids.push(i.id)
  return ids
}

/**
 * Shift-range select. Sets every leaf row between `fromId` and `toId`
 * (inclusive, in display order) to `want`, then re-applies the no-orphan rule:
 * a selected sub-bullet always keeps its parent task selected.
 */
export function setRange(
  draft: EodFormState,
  sel: Set<string>,
  fromId: string,
  toId: string,
  want: boolean,
): Set<string> {
  const all = allSelectableIds(draft)
  const a = all.indexOf(fromId)
  const b = all.indexOf(toId)
  if (a < 0 || b < 0) return new Set(sel)
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  const next = new Set(sel)
  for (let i = lo; i <= hi; i++) {
    if (want) next.add(all[i])
    else next.delete(all[i])
  }
  for (const p of draft.projects)
    for (const t of p.tasksCompleted)
      if (t.subBullets.some(s => next.has(s.id))) next.add(t.id)
  return next
}

/** Toggle a task; turning it off drops its sub-bullets, on restores them all. */
export function toggleTask(draft: EodFormState, sel: Set<string>, taskId: string): Set<string> {
  const next = new Set(sel)
  const task = findTask(draft, taskId)
  if (!task) return next
  if (next.has(taskId)) {
    next.delete(taskId)
    for (const s of task.subBullets) next.delete(s.id)
  } else {
    next.add(taskId)
    for (const s of task.subBullets) next.add(s.id)
  }
  return next
}

/** Toggle a sub-bullet; selecting one also selects its parent task. */
export function toggleSub(sel: Set<string>, taskId: string, subId: string): Set<string> {
  const next = new Set(sel)
  if (next.has(subId)) {
    next.delete(subId)
  } else {
    next.add(subId)
    next.add(taskId)
  }
  return next
}

export function toggleSectionItem(sel: Set<string>, itemId: string): Set<string> {
  const next = new Set(sel)
  if (next.has(itemId)) next.delete(itemId)
  else next.add(itemId)
  return next
}

/** Project checkbox flips all its tasks (and their sub-bullets) on or off. */
export function toggleProject(draft: EodFormState, sel: Set<string>, projectId: string): Set<string> {
  const next = new Set(sel)
  const p = draft.projects.find(p => p.id === projectId)
  if (!p) return next
  const selectAll = projectCheck(draft, sel, projectId) !== 'all'
  for (const t of p.tasksCompleted) {
    if (selectAll) {
      next.add(t.id)
      for (const s of t.subBullets) next.add(s.id)
    } else {
      next.delete(t.id)
      for (const s of t.subBullets) next.delete(s.id)
    }
  }
  return next
}

export function projectCheck(draft: EodFormState, sel: Set<string>, projectId: string): ProjectCheck {
  const p = draft.projects.find(p => p.id === projectId)
  if (!p || p.tasksCompleted.length === 0) return 'none'
  const picked = p.tasksCompleted.filter(t => sel.has(t.id)).length
  if (picked === 0) return 'none'
  if (picked === p.tasksCompleted.length) return 'all'
  return 'some'
}

/** Count of selected lines (tasks + section items; sub-bullets ride along). */
export function selectedCount(draft: EodFormState, sel: Set<string>): number {
  let n = 0
  for (const p of draft.projects) for (const t of p.tasksCompleted) if (sel.has(t.id)) n++
  for (const sk of PICKER_SECTIONS) for (const i of draft[sk].items) if (sel.has(i.id)) n++
  return n
}

/** Whether the draft has anything to pick at all. */
export function hasSelectable(draft: EodFormState): boolean {
  if (draft.projects.some(p => p.tasksCompleted.length > 0)) return true
  return PICKER_SECTIONS.some(sk => draft[sk].items.length > 0)
}

/**
 * Build a form-shaped subset holding only the selected tasks/subs/section items.
 * Project shells with no selected task are dropped; holidays always empty.
 */
export function selectedSubset(draft: EodFormState, sel: Set<string>): EodFormState {
  const projects = draft.projects
    .map(p => ({
      ...p,
      tasksCompleted: p.tasksCompleted
        .filter(t => sel.has(t.id))
        .map(t => ({ ...t, subBullets: t.subBullets.filter(s => sel.has(s.id)) })),
    }))
    .filter(p => p.tasksCompleted.length > 0)

  const section = (sk: PickerSection) => {
    const items = draft[sk].items.filter(i => sel.has(i.id))
    return { items, isNA: items.length === 0 }
  }

  return {
    date: draft.date,
    projects,
    otherTasks: section('otherTasks'),
    concerns: section('concerns'),
    nextDayPlan: section('nextDayPlan'),
    upcomingHolidays: { items: [], isNA: true },
  }
}
