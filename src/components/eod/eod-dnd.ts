import { arrayMove } from '@dnd-kit/sortable'
import { closestCenter, type CollisionDetection } from '@dnd-kit/core'
import { makeId } from '@/lib/eod-types'
import type { EodFormState, EodTask, EodSubBullet } from '@/lib/eod-types'

// ── Shared UI type ────────────────────────────────────────────────────────────

export type FormLayoutMode = 'comfortable' | 'focused' | 'zen'

// ── Section keys ──────────────────────────────────────────────────────────────

export type SectionKey = 'otherTasks' | 'concerns' | 'nextDayPlan' | 'upcomingHolidays'

export const SECTION_KEYS: SectionKey[] = ['otherTasks', 'concerns', 'nextDayPlan', 'upcomingHolidays']

// ── Item metadata (discriminated union) ───────────────────────────────────────

export type MoveTarget =
  | { type: 'task';    taskId: string }
  | { type: 'sub';     taskId: string; subId: string }
  | { type: 'section'; sk: SectionKey; itemId: string }

export type ItemMeta =
  | { type: 'task';         container: 'tasks';              taskId: string;                       text: string }
  | { type: 'sub';          container: `subs:${string}`;      taskId: string; subId: string;        text: string }
  | { type: 'section-item'; container: `section:${string}`;  sk: SectionKey; itemId: string;       text: string }

// ── Pure state transformations ────────────────────────────────────────────────

export function removeFromSource(src: ItemMeta, state: EodFormState): EodFormState {
  if (src.type === 'task') {
    return { ...state, tasksCompleted: state.tasksCompleted.filter(t => t.id !== src.taskId) }
  }
  if (src.type === 'sub') {
    return {
      ...state,
      tasksCompleted: state.tasksCompleted.map(t =>
        t.id === src.taskId ? { ...t, subBullets: t.subBullets.filter(s => s.id !== src.subId) } : t
      ),
    }
  }
  const section = state[src.sk]
  const items = section.items.filter(i => i.id !== src.itemId)
  return { ...state, [src.sk]: { items, isNA: items.length === 0 } }
}

export function insertIntoDest(dstContainer: string, overId: string, text: string, state: EodFormState): EodFormState {
  const id = makeId()

  if (dstContainer === 'tasks') {
    const newTask: EodTask = { id, text, subBullets: [] }
    if (overId === 'tasks') return { ...state, tasksCompleted: [...state.tasksCompleted, newTask] }
    const idx = state.tasksCompleted.findIndex(t => t.id === overId)
    const tasks = [...state.tasksCompleted]
    tasks.splice(idx >= 0 ? idx + 1 : tasks.length, 0, newTask)
    return { ...state, tasksCompleted: tasks }
  }

  if (dstContainer.startsWith('subs:')) {
    const taskId = dstContainer.slice(5)
    const newSub: EodSubBullet = { id, text }
    return {
      ...state,
      tasksCompleted: state.tasksCompleted.map(t => {
        if (t.id !== taskId) return t
        if (overId === dstContainer) return { ...t, subBullets: [...t.subBullets, newSub] }
        const idx = t.subBullets.findIndex(s => s.id === overId)
        const subs = [...t.subBullets]
        subs.splice(idx >= 0 ? idx + 1 : subs.length, 0, newSub)
        return { ...t, subBullets: subs }
      }),
    }
  }

  if (dstContainer.startsWith('section:')) {
    const sk = dstContainer.slice(8) as SectionKey
    const newItem = { id, text }
    const section = state[sk]
    if (overId === dstContainer || section.isNA) {
      return { ...state, [sk]: { isNA: false, items: [...section.items, newItem] } }
    }
    const idx = section.items.findIndex(i => i.id === overId)
    const items = [...section.items]
    items.splice(idx >= 0 ? idx + 1 : items.length, 0, newItem)
    return { ...state, [sk]: { isNA: false, items } }
  }

  return state
}

export function reorderWithinContainer(src: ItemMeta, overId: string, state: EodFormState): EodFormState {
  if (src.container === 'tasks') {
    const oldIdx = state.tasksCompleted.findIndex(t => t.id === src.taskId)
    const newIdx = state.tasksCompleted.findIndex(t => t.id === overId)
    if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return state
    return { ...state, tasksCompleted: arrayMove(state.tasksCompleted, oldIdx, newIdx) }
  }
  if (src.container.startsWith('subs:')) {
    const taskId = src.container.slice(5)
    const subSrc = src as Extract<ItemMeta, { type: 'sub' }>
    return {
      ...state,
      tasksCompleted: state.tasksCompleted.map(t => {
        if (t.id !== taskId) return t
        const oldIdx = t.subBullets.findIndex(s => s.id === subSrc.subId)
        const newIdx = t.subBullets.findIndex(s => s.id === overId)
        if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return t
        return { ...t, subBullets: arrayMove(t.subBullets, oldIdx, newIdx) }
      }),
    }
  }
  if (src.container.startsWith('section:')) {
    const sk = src.container.slice(8) as SectionKey
    const secSrc = src as Extract<ItemMeta, { type: 'section-item' }>
    const section = state[sk]
    const oldIdx = section.items.findIndex(i => i.id === secSrc.itemId)
    const newIdx = section.items.findIndex(i => i.id === overId)
    if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return state
    return { ...state, [sk]: { ...section, items: arrayMove(section.items, oldIdx, newIdx) } }
  }
  return state
}

// ── Horizontal drag intent ────────────────────────────────────────────────────

export const INDENT_THRESHOLD = 32

export function computeProjectedDepth(src: ItemMeta, deltaX: number): 0 | 1 {
  if (src.type === 'sub' && deltaX < -INDENT_THRESHOLD) return 0
  if (src.type !== 'sub' && deltaX > INDENT_THRESHOLD) return 1
  return src.type === 'sub' ? 1 : 0
}

// ── Custom collision detection ────────────────────────────────────────────────
// Pick smallest droppable containing the pointer (most specific hit).
// Falls back to closestCenter for keyboard sensor compatibility.

function isInRect(pt: { x: number; y: number }, r: { left: number; right: number; top: number; bottom: number }) {
  return pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom
}

function isDndContainerId(id: string) {
  return id === 'tasks' || id.startsWith('subs:') || id.startsWith('section:')
}

export const customCollision: CollisionDetection = (args) => {
  const { droppableContainers, droppableRects, pointerCoordinates } = args
  if (!pointerCoordinates) return closestCenter(args)

  type Hit = { id: string; area: number; isContainer: boolean; raw: (typeof droppableContainers)[0] }
  const hits: Hit[] = []
  for (const dc of droppableContainers) {
    const rect = droppableRects.get(dc.id)
    if (rect && isInRect(pointerCoordinates, rect)) {
      hits.push({ id: String(dc.id), area: rect.width * rect.height, isContainer: isDndContainerId(String(dc.id)), raw: dc })
    }
  }
  if (hits.length === 0) return closestCenter(args)

  const items = hits.filter(h => !h.isContainer)
  const candidates = items.length > 0 ? items : hits
  candidates.sort((a, b) => a.area - b.area)
  const winner = candidates[0]
  return [{ id: winner.id, data: { droppableContainer: winner.raw, value: 0 } }]
}
