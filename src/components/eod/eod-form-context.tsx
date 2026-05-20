import {
  createContext, use, useEffect, useLayoutEffect, useMemo, useRef,
  type ReactNode,
} from 'react'
import { makeId, makeEmptyTask } from '@/lib/eod-types'
import type { EodFormState, ProjectStatus } from '@/lib/eod-types'
import { SECTION_KEYS, type FormLayoutMode, type SectionKey } from './eod-dnd'

// ── Action surface ────────────────────────────────────────────────────────────
// Identity is stable across renders — actions read live state via valueRef so
// memoized children don't re-render when parents pass new closures.

export interface EodActions {
  setProject: (text: string) => void
  setProjectStatus: (s: ProjectStatus) => void

  addTaskAfter: (afterId: string | null) => void
  updateTask: (id: string, text: string) => void
  removeTask: (id: string) => void

  addSub: (taskId: string, afterSubId?: string) => void
  updateSub: (taskId: string, subId: string, text: string) => void
  removeSub: (taskId: string, subId: string) => void

  addSectionItem: (sk: SectionKey, afterId: string | null) => void
  updateSectionItem: (sk: SectionKey, id: string, text: string) => void
  removeSectionItem: (sk: SectionKey, id: string) => void
  setSectionNA: (sk: SectionKey) => void
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

// Two contexts: stable api vs volatile dnd state. Splitting keeps cards that
// don't care about drag activity from re-rendering on every drag tick.
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
  // Latest-value refs. Synced in a layout effect (not during render) so the
  // stable action callbacks below can read the current value/onChange.
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => {
    valueRef.current = value
    onChangeRef.current = onChange
  })

  const inputRefs = useRef<Map<string, HTMLElement>>(new Map())
  const pendingFocus = useRef<string | null>(null)

  // Flush pending focus after each commit. Cheap; element lookup short-circuits.
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
      const keys: string[] = ['project']
      for (const task of v.tasksCompleted) {
        keys.push(`task:${task.id}`)
        for (const sub of task.subBullets) keys.push(`sub:${task.id}:${sub.id}`)
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
    const setTasks = (tasks: EodFormState['tasksCompleted']) =>
      commit({ ...v(), tasksCompleted: tasks })
    const mapTask = (
      id: string,
      fn: (t: EodFormState['tasksCompleted'][number]) => EodFormState['tasksCompleted'][number],
    ) => setTasks(v().tasksCompleted.map(t => (t.id === id ? fn(t) : t)))

    return {
      setProject: text => commit({ ...v(), project: text }),
      setProjectStatus: s => commit({ ...v(), projectStatus: s }),

      addTaskAfter: afterId => {
        const t = makeEmptyTask()
        pendingFocus.current = `task:${t.id}`
        const tasks = v().tasksCompleted
        if (afterId === null) {
          setTasks([...tasks, t])
        } else {
          const idx = tasks.findIndex(x => x.id === afterId)
          setTasks([...tasks.slice(0, idx + 1), t, ...tasks.slice(idx + 1)])
        }
      },
      updateTask: (id, text) => mapTask(id, t => ({ ...t, text })),
      removeTask: id => setTasks(v().tasksCompleted.filter(t => t.id !== id)),

      addSub: (taskId, afterSubId) => {
        const subId = makeId()
        pendingFocus.current = `sub:${taskId}:${subId}`
        mapTask(taskId, t => {
          const newSub = { id: subId, text: '' }
          if (!afterSubId) return { ...t, subBullets: [...t.subBullets, newSub] }
          const idx = t.subBullets.findIndex(s => s.id === afterSubId)
          return {
            ...t,
            subBullets: [...t.subBullets.slice(0, idx + 1), newSub, ...t.subBullets.slice(idx + 1)],
          }
        })
      },
      updateSub: (taskId, subId, text) =>
        mapTask(taskId, t => ({
          ...t,
          subBullets: t.subBullets.map(s => (s.id === subId ? { ...s, text } : s)),
        })),
      removeSub: (taskId, subId) =>
        mapTask(taskId, t => ({ ...t, subBullets: t.subBullets.filter(s => s.id !== subId) })),

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
