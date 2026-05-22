import {
  createContext, use, useEffect, useLayoutEffect, useMemo, useRef,
  type ReactNode,
} from 'react'
import { makeId, makeEmptyTask, makeEmptyProject } from '@/lib/eod-types'
import type { EodFormState, EodTask, ProjectStatus } from '@/lib/eod-types'
import { arrayMove } from '@dnd-kit/sortable'
import { SECTION_KEYS, type FormLayoutMode, type MoveTarget, type SectionKey } from './eod-dnd'

// ── Project scope context ─────────────────────────────────────────────────────
// Wraps each ProjectCard so SortableTaskCard/SortableSub can read projectId
// without prop-threading.

export const EodProjectContext = createContext<string | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useProjectId(): string {
  const id = use(EodProjectContext)
  if (!id) throw new Error('useProjectId must be used inside EodProjectContext.Provider')
  return id
}

// ── Action surface ────────────────────────────────────────────────────────────

export interface EodActions {
  addProject: () => void
  removeProject: (projectId: string) => void
  setProjectName: (projectId: string, text: string) => void
  setProjectStatus: (projectId: string, s: ProjectStatus) => void
  setProjectStatusNote: (projectId: string, note: string | null) => void

  addTaskAfter: (projectId: string, afterId: string | null) => void
  updateTask: (projectId: string, id: string, text: string) => void
  removeTask: (projectId: string, id: string) => void

  addSub: (projectId: string, taskId: string, afterSubId?: string) => void
  updateSub: (projectId: string, taskId: string, subId: string, text: string) => void
  removeSub: (projectId: string, taskId: string, subId: string) => void

  addSectionItem: (sk: SectionKey, afterId: string | null) => void
  updateSectionItem: (sk: SectionKey, id: string, text: string) => void
  removeSectionItem: (sk: SectionKey, id: string) => void
  setSectionNA: (sk: SectionKey) => void

  moveUp:        (target: MoveTarget) => void
  moveDown:      (target: MoveTarget) => void
  reorderUp:     (target: MoveTarget) => void
  reorderDown:   (target: MoveTarget) => void
  duplicateItem: (target: MoveTarget) => void
}

export interface EodFocusApi {
  reg: (key: string) => (el: HTMLElement | null) => void
  focus: (key: string) => void
  focusNext: (key: string) => void
  focusPrev: (key: string) => void
}

export interface EodApi {
  mode: FormLayoutMode
  actions: EodActions
  focus: EodFocusApi
}

const EodApiContext = createContext<EodApi | null>(null)
const EodDndStateContext = createContext<{ activeId: string | null }>({ activeId: null })

// eslint-disable-next-line react-refresh/only-export-components
export function useEodApi(): EodApi {
  const v = use(EodApiContext)
  if (!v) throw new Error('useEodApi must be used inside <EodFormProvider>')
  return v
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEodDndState() {
  return use(EodDndStateContext)
}

// ── Provider ──────────────────────────────────────────────────────────────────

interface ProviderProps {
  value: EodFormState
  onChange: (v: EodFormState) => void
  mode: FormLayoutMode
  activeId: string | null
  children: ReactNode
}

export function EodFormProvider({ value, onChange, mode, activeId, children }: ProviderProps) {
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => {
    valueRef.current = value
    onChangeRef.current = onChange
  })

  const inputRefs = useRef<Map<string, HTMLElement>>(new Map())
  const pendingFocus = useRef<string | null>(null)

  useEffect(() => {
    const key = pendingFocus.current
    if (!key) return
    const el = inputRefs.current.get(key)
    if (!el) return
    el.focus()
    if (el instanceof HTMLInputElement) {
      const len = el.value.length
      el.setSelectionRange(len, len)
    }
    pendingFocus.current = null
  })

  const focusApi = useMemo<EodFocusApi>(() => {
    const focus = (key: string) => {
      const el = inputRefs.current.get(key)
      if (!el) { pendingFocus.current = key; return }
      el.focus()
      if (el instanceof HTMLInputElement) {
        const len = el.value.length
        el.setSelectionRange(len, len)
      }
    }
    const getOrderedKeys = () => {
      const v = valueRef.current
      const keys: string[] = []
      for (const project of v.projects) {
        keys.push(`project:${project.id}`)
        if (project.statusNote !== null) keys.push(`project-status:${project.id}`)
        if (project.tasksCompleted.length === 0) {
          keys.push(`na:tasks:${project.id}`)
        } else {
          for (const task of project.tasksCompleted) {
            keys.push(`task:${task.id}`)
            for (const sub of task.subBullets) keys.push(`sub:${task.id}:${sub.id}`)
          }
        }
      }
      for (const sk of SECTION_KEYS) {
        const s = v[sk]
        if (s.isNA) keys.push(`na:${sk}`)
        else for (const item of s.items) keys.push(`section:${sk}:${item.id}`)
      }
      return keys
    }
    return {
      reg: (key: string) => (el: HTMLElement | null) => {
        if (el) inputRefs.current.set(key, el)
        else inputRefs.current.delete(key)
      },
      focus,
      focusNext: (key: string) => {
        const keys = getOrderedKeys()
        const i = keys.indexOf(key)
        if (i >= 0 && i < keys.length - 1) focus(keys[i + 1])
      },
      focusPrev: (key: string) => {
        const keys = getOrderedKeys()
        const i = keys.indexOf(key)
        if (i > 0) focus(keys[i - 1])
      },
    }
  }, [])

  const actions = useMemo<EodActions>(() => {
    const commit = (next: EodFormState) => onChangeRef.current(next)
    const v = () => valueRef.current

    const getProjectTasks = (projectId: string): EodTask[] =>
      v().projects.find(p => p.id === projectId)?.tasksCompleted ?? []

    const setProjectTasks = (projectId: string, tasks: EodTask[]) =>
      commit({ ...v(), projects: v().projects.map(p => p.id === projectId ? { ...p, tasksCompleted: tasks } : p) })

    const mapTask = (projectId: string, taskId: string, fn: (t: EodTask) => EodTask) =>
      setProjectTasks(projectId, getProjectTasks(projectId).map(t => t.id === taskId ? fn(t) : t))

    return {
      addProject: () => {
        const p = makeEmptyProject()
        commit({ ...v(), projects: [...v().projects, p] })
        pendingFocus.current = `project:${p.id}`
      },

      removeProject: (projectId) => {
        const projects = v().projects
        if (projects.length <= 1) return
        const idx = projects.findIndex(p => p.id === projectId)
        const remaining = projects.filter(p => p.id !== projectId)
        commit({ ...v(), projects: remaining })
        const focusTarget = remaining[Math.max(0, idx - 1)]
        if (focusTarget) pendingFocus.current = `project:${focusTarget.id}`
      },

      setProjectName: (projectId, text) =>
        commit({ ...v(), projects: v().projects.map(p => p.id === projectId ? { ...p, name: text } : p) }),

      setProjectStatus: (projectId, s) =>
        commit({ ...v(), projects: v().projects.map(p => p.id === projectId ? { ...p, status: s } : p) }),

      setProjectStatusNote: (projectId, note) => {
        if (note === '') pendingFocus.current = `project-status:${projectId}`
        commit({ ...v(), projects: v().projects.map(p => p.id === projectId ? { ...p, statusNote: note } : p) })
      },

      addTaskAfter: (projectId, afterId) => {
        const t = makeEmptyTask()
        pendingFocus.current = `task:${t.id}`
        const tasks = getProjectTasks(projectId)
        if (afterId === null) {
          setProjectTasks(projectId, [...tasks, t])
        } else {
          const idx = tasks.findIndex(x => x.id === afterId)
          setProjectTasks(projectId, [...tasks.slice(0, idx + 1), t, ...tasks.slice(idx + 1)])
        }
      },

      updateTask: (projectId, id, text) => mapTask(projectId, id, t => ({ ...t, text })),

      removeTask: (projectId, id) => setProjectTasks(projectId, getProjectTasks(projectId).filter(t => t.id !== id)),

      addSub: (projectId, taskId, afterSubId) => {
        const subId = makeId()
        pendingFocus.current = `sub:${taskId}:${subId}`
        mapTask(projectId, taskId, t => {
          const newSub = { id: subId, text: '' }
          if (!afterSubId) return { ...t, subBullets: [...t.subBullets, newSub] }
          const idx = t.subBullets.findIndex(s => s.id === afterSubId)
          return {
            ...t,
            subBullets: [...t.subBullets.slice(0, idx + 1), newSub, ...t.subBullets.slice(idx + 1)],
          }
        })
      },

      updateSub: (projectId, taskId, subId, text) =>
        mapTask(projectId, taskId, t => ({
          ...t,
          subBullets: t.subBullets.map(s => (s.id === subId ? { ...s, text } : s)),
        })),

      removeSub: (projectId, taskId, subId) =>
        mapTask(projectId, taskId, t => ({ ...t, subBullets: t.subBullets.filter(s => s.id !== subId) })),

      addSectionItem: (sk, afterId) => {
        const newId = makeId()
        pendingFocus.current = `section:${sk}:${newId}`
        const section = v()[sk]
        const newItem = { id: newId, text: '' }
        if (afterId === null) {
          commit({ ...v(), [sk]: { isNA: false, items: [...section.items, newItem] } })
        } else {
          const idx = section.items.findIndex(i => i.id === afterId)
          const items = [
            ...section.items.slice(0, idx + 1),
            newItem,
            ...section.items.slice(idx + 1),
          ]
          commit({ ...v(), [sk]: { ...section, items } })
        }
      },

      updateSectionItem: (sk, id, text) => {
        const section = v()[sk]
        commit({
          ...v(),
          [sk]: { ...section, items: section.items.map(i => (i.id === id ? { ...i, text } : i)) },
        })
      },

      removeSectionItem: (sk, id) => {
        const items = v()[sk].items.filter(i => i.id !== id)
        commit({ ...v(), [sk]: { items, isNA: items.length === 0 } })
      },

      setSectionNA: sk => commit({ ...v(), [sk]: { items: [], isNA: true } }),

      moveUp: (target) => {
        if (target.type === 'task') {
          const tasks = getProjectTasks(target.projectId)
          const idx = tasks.findIndex(t => t.id === target.taskId)
          if (idx < 0) return
          const task = tasks[idx]
          if (task.subBullets.length > 0) {
            if (idx > 0) {
              setProjectTasks(target.projectId, arrayMove(tasks, idx, idx - 1))
              pendingFocus.current = `task:${target.taskId}`
            }
          } else if (idx > 0) {
            const prev = tasks[idx - 1]
            const newSubId = makeId()
            setProjectTasks(
              target.projectId,
              tasks
                .filter(t => t.id !== target.taskId)
                .map(t => t.id === prev.id
                  ? { ...t, subBullets: [...t.subBullets, { id: newSubId, text: task.text }] }
                  : t)
            )
            pendingFocus.current = `sub:${prev.id}:${newSubId}`
          } else {
            // idx === 0: cross to bottom of previous project
            const projectIdx = v().projects.findIndex(p => p.id === target.projectId)
            if (projectIdx <= 0) return
            const newTaskId = makeId()
            commit({ ...v(), projects: v().projects.map((p, i) => {
              if (i === projectIdx) return { ...p, tasksCompleted: tasks.filter(t => t.id !== target.taskId) }
              if (i === projectIdx - 1) return { ...p, tasksCompleted: [...p.tasksCompleted, { id: newTaskId, text: task.text, subBullets: [] }] }
              return p
            })})
            pendingFocus.current = `task:${newTaskId}`
          }
        } else if (target.type === 'sub') {
          const tasks = getProjectTasks(target.projectId)
          const task = tasks.find(t => t.id === target.taskId)
          if (!task) return
          const subIdx = task.subBullets.findIndex(s => s.id === target.subId)
          if (subIdx > 0) {
            mapTask(target.projectId, target.taskId, t => ({ ...t, subBullets: arrayMove(t.subBullets, subIdx, subIdx - 1) }))
            pendingFocus.current = `sub:${target.taskId}:${target.subId}`
          } else {
            const taskIdx = tasks.findIndex(t => t.id === target.taskId)
            const sub = task.subBullets[subIdx]
            const newTaskId = makeId()
            const updated = tasks.map(t =>
              t.id === target.taskId ? { ...t, subBullets: t.subBullets.filter(s => s.id !== target.subId) } : t
            )
            updated.splice(taskIdx, 0, { id: newTaskId, text: sub.text, subBullets: [] })
            setProjectTasks(target.projectId, updated)
            pendingFocus.current = `task:${newTaskId}`
          }
        } else {
          const section = v()[target.sk]
          const idx = section.items.findIndex(i => i.id === target.itemId)
          if (idx < 0) return
          if (idx > 0) {
            commit({ ...v(), [target.sk]: { ...section, items: arrayMove(section.items, idx, idx - 1) } })
            pendingFocus.current = `section:${target.sk}:${target.itemId}`
          } else {
            const skIdx = SECTION_KEYS.indexOf(target.sk)
            const text = section.items[idx].text
            const newId = makeId()
            const newItems = section.items.filter(i => i.id !== target.itemId)
            let next: EodFormState = { ...v(), [target.sk]: { items: newItems, isNA: newItems.length === 0 } }
            if (skIdx > 0) {
              const prevSk = SECTION_KEYS[skIdx - 1]
              const prevSection = next[prevSk]
              next = { ...next, [prevSk]: { isNA: false, items: [...prevSection.items, { id: newId, text }] } }
              commit(next)
              pendingFocus.current = `section:${prevSk}:${newId}`
            } else {
              // Cross into last project's tasks
              const lastProject = next.projects[next.projects.length - 1]
              next = { ...next, projects: next.projects.map(p =>
                p.id === lastProject.id
                  ? { ...p, tasksCompleted: [...p.tasksCompleted, { id: newId, text, subBullets: [] }] }
                  : p
              )}
              commit(next)
              pendingFocus.current = `task:${newId}`
            }
          }
        }
      },

      moveDown: (target) => {
        if (target.type === 'task') {
          const tasks = getProjectTasks(target.projectId)
          const idx = tasks.findIndex(t => t.id === target.taskId)
          if (idx < 0) return
          const task = tasks[idx]
          if (task.subBullets.length > 0) {
            if (idx < tasks.length - 1) {
              setProjectTasks(target.projectId, arrayMove(tasks, idx, idx + 1))
              pendingFocus.current = `task:${target.taskId}`
            }
          } else if (idx < tasks.length - 1) {
            const next = tasks[idx + 1]
            const newSubId = makeId()
            setProjectTasks(
              target.projectId,
              tasks
                .filter(t => t.id !== target.taskId)
                .map(t => t.id === next.id
                  ? { ...t, subBullets: [{ id: newSubId, text: task.text }, ...t.subBullets] }
                  : t)
            )
            pendingFocus.current = `sub:${next.id}:${newSubId}`
          } else {
            // last task of this project — cross to next project or otherTasks
            const projectIdx = v().projects.findIndex(p => p.id === target.projectId)
            const isLastProject = projectIdx === v().projects.length - 1
            if (!isLastProject) {
              const newTaskId = makeId()
              commit({ ...v(), projects: v().projects.map((p, i) => {
                if (i === projectIdx) return { ...p, tasksCompleted: tasks.filter(t => t.id !== target.taskId) }
                if (i === projectIdx + 1) return { ...p, tasksCompleted: [{ id: newTaskId, text: task.text, subBullets: [] }, ...p.tasksCompleted] }
                return p
              })})
              pendingFocus.current = `task:${newTaskId}`
            } else {
              const firstSk = SECTION_KEYS[0]
              const newId = makeId()
              const filtered = tasks.filter(t => t.id !== target.taskId)
              const prevSection = v()[firstSk]
              commit({
                ...v(),
                projects: v().projects.map((p, i) => i === projectIdx ? { ...p, tasksCompleted: filtered } : p),
                [firstSk]: { isNA: false, items: [{ id: newId, text: task.text }, ...prevSection.items] },
              })
              pendingFocus.current = `section:${firstSk}:${newId}`
            }
          }
        } else if (target.type === 'sub') {
          const tasks = getProjectTasks(target.projectId)
          const task = tasks.find(t => t.id === target.taskId)
          if (!task) return
          const subIdx = task.subBullets.findIndex(s => s.id === target.subId)
          if (subIdx < task.subBullets.length - 1) {
            mapTask(target.projectId, target.taskId, t => ({ ...t, subBullets: arrayMove(t.subBullets, subIdx, subIdx + 1) }))
            pendingFocus.current = `sub:${target.taskId}:${target.subId}`
          } else {
            const taskIdx = tasks.findIndex(t => t.id === target.taskId)
            const sub = task.subBullets[subIdx]
            const newTaskId = makeId()
            const updated = tasks.map(t =>
              t.id === target.taskId ? { ...t, subBullets: t.subBullets.filter(s => s.id !== target.subId) } : t
            )
            updated.splice(taskIdx + 1, 0, { id: newTaskId, text: sub.text, subBullets: [] })
            setProjectTasks(target.projectId, updated)
            pendingFocus.current = `task:${newTaskId}`
          }
        } else {
          const section = v()[target.sk]
          const idx = section.items.findIndex(i => i.id === target.itemId)
          if (idx < 0) return
          if (idx < section.items.length - 1) {
            commit({ ...v(), [target.sk]: { ...section, items: arrayMove(section.items, idx, idx + 1) } })
            pendingFocus.current = `section:${target.sk}:${target.itemId}`
          } else {
            const skIdx = SECTION_KEYS.indexOf(target.sk)
            if (skIdx === SECTION_KEYS.length - 1) return
            const text = section.items[idx].text
            const newId = makeId()
            const newItems = section.items.filter(i => i.id !== target.itemId)
            let next: EodFormState = { ...v(), [target.sk]: { items: newItems, isNA: newItems.length === 0 } }
            const nextSk = SECTION_KEYS[skIdx + 1]
            const nextSection = next[nextSk]
            next = { ...next, [nextSk]: { isNA: false, items: [{ id: newId, text }, ...nextSection.items] } }
            commit(next)
            pendingFocus.current = `section:${nextSk}:${newId}`
          }
        }
      },

      reorderUp: (target) => {
        if (target.type === 'task') {
          const tasks = getProjectTasks(target.projectId)
          const idx = tasks.findIndex(t => t.id === target.taskId)
          if (idx > 0) setProjectTasks(target.projectId, arrayMove(tasks, idx, idx - 1))
        } else if (target.type === 'sub') {
          const tasks = getProjectTasks(target.projectId)
          const task = tasks.find(t => t.id === target.taskId)
          if (!task) return
          const subIdx = task.subBullets.findIndex(s => s.id === target.subId)
          if (subIdx > 0) mapTask(target.projectId, target.taskId, t => ({ ...t, subBullets: arrayMove(t.subBullets, subIdx, subIdx - 1) }))
        } else {
          const section = v()[target.sk]
          const idx = section.items.findIndex(i => i.id === target.itemId)
          if (idx > 0) commit({ ...v(), [target.sk]: { ...section, items: arrayMove(section.items, idx, idx - 1) } })
        }
      },

      reorderDown: (target) => {
        if (target.type === 'task') {
          const tasks = getProjectTasks(target.projectId)
          const idx = tasks.findIndex(t => t.id === target.taskId)
          if (idx < tasks.length - 1) setProjectTasks(target.projectId, arrayMove(tasks, idx, idx + 1))
        } else if (target.type === 'sub') {
          const tasks = getProjectTasks(target.projectId)
          const task = tasks.find(t => t.id === target.taskId)
          if (!task) return
          const subIdx = task.subBullets.findIndex(s => s.id === target.subId)
          if (subIdx < task.subBullets.length - 1) mapTask(target.projectId, target.taskId, t => ({ ...t, subBullets: arrayMove(t.subBullets, subIdx, subIdx + 1) }))
        } else {
          const section = v()[target.sk]
          const idx = section.items.findIndex(i => i.id === target.itemId)
          if (idx < section.items.length - 1) commit({ ...v(), [target.sk]: { ...section, items: arrayMove(section.items, idx, idx + 1) } })
        }
      },

      duplicateItem: (target) => {
        if (target.type === 'task') {
          const tasks = getProjectTasks(target.projectId)
          const idx = tasks.findIndex(t => t.id === target.taskId)
          if (idx < 0) return
          const src = tasks[idx]
          const newTask = {
            id: makeId(),
            text: src.text,
            subBullets: src.subBullets.map(s => ({ id: makeId(), text: s.text })),
          }
          const next = [...tasks]
          next.splice(idx + 1, 0, newTask)
          setProjectTasks(target.projectId, next)
          pendingFocus.current = `task:${newTask.id}`
        } else if (target.type === 'sub') {
          const tasks = getProjectTasks(target.projectId)
          const task = tasks.find(t => t.id === target.taskId)
          if (!task) return
          const subIdx = task.subBullets.findIndex(s => s.id === target.subId)
          if (subIdx < 0) return
          const newSubId = makeId()
          const newSub = { id: newSubId, text: task.subBullets[subIdx].text }
          mapTask(target.projectId, target.taskId, t => {
            const subs = [...t.subBullets]
            subs.splice(subIdx + 1, 0, newSub)
            return { ...t, subBullets: subs }
          })
          pendingFocus.current = `sub:${target.taskId}:${newSubId}`
        } else {
          const section = v()[target.sk]
          const idx = section.items.findIndex(i => i.id === target.itemId)
          if (idx < 0) return
          const newId = makeId()
          const newItem = { id: newId, text: section.items[idx].text }
          const items = [...section.items]
          items.splice(idx + 1, 0, newItem)
          commit({ ...v(), [target.sk]: { ...section, items } })
          pendingFocus.current = `section:${target.sk}:${newId}`
        }
      },
    }
  }, [])

  const api = useMemo<EodApi>(() => ({ mode, actions, focus: focusApi }), [mode, actions, focusApi])
  const dndState = useMemo(() => ({ activeId }), [activeId])

  return (
    <EodApiContext value={api}>
      <EodDndStateContext value={dndState}>
        {children}
      </EodDndStateContext>
    </EodApiContext>
  )
}
