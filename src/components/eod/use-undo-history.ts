import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { EodFormState } from '@/lib/eod-types'
import { SECTION_KEYS } from './eod-dnd'

const COALESCE_MS = 600
const MAX_HISTORY = 100

function isStructurallyIdentical(a: EodFormState, b: EodFormState): boolean {
  if (a.projects.length !== b.projects.length) return false
  for (let pi = 0; pi < a.projects.length; pi++) {
    const ap = a.projects[pi], bp = b.projects[pi]
    if (ap.id !== bp.id || ap.status !== bp.status) return false
    if (ap.tasksCompleted.length !== bp.tasksCompleted.length) return false
    for (let i = 0; i < ap.tasksCompleted.length; i++) {
      const at = ap.tasksCompleted[i], bt = bp.tasksCompleted[i]
      if (at.id !== bt.id || at.subBullets.length !== bt.subBullets.length) return false
      for (let j = 0; j < at.subBullets.length; j++) {
        if (at.subBullets[j].id !== bt.subBullets[j].id) return false
      }
    }
  }
  for (const sk of SECTION_KEYS) {
    const as = a[sk], bs = b[sk]
    if (as.isNA !== bs.isNA || as.items.length !== bs.items.length) return false
    for (let i = 0; i < as.items.length; i++) {
      if (as.items[i].id !== bs.items[i].id) return false
    }
  }
  return true
}

function getEditKey(a: EodFormState, b: EodFormState): string | null {
  if (!isStructurallyIdentical(a, b)) return null

  for (let pi = 0; pi < a.projects.length; pi++) {
    const ap = a.projects[pi], bp = b.projects[pi]
    if (ap.name !== bp.name) return `project:${ap.id}`
    for (let i = 0; i < ap.tasksCompleted.length; i++) {
      const at = ap.tasksCompleted[i], bt = bp.tasksCompleted[i]
      if (at.text !== bt.text) return `task:${at.id}`
      for (let j = 0; j < at.subBullets.length; j++) {
        if (at.subBullets[j].text !== bt.subBullets[j].text) {
          return `sub:${at.id}:${at.subBullets[j].id}`
        }
      }
    }
  }

  for (const sk of SECTION_KEYS) {
    for (let i = 0; i < a[sk].items.length; i++) {
      if (a[sk].items[i].text !== b[sk].items[i].text) {
        return `section:${sk}:${a[sk].items[i].id}`
      }
    }
  }

  return null
}

export function useUndoHistory(value: EodFormState, onChange: (v: EodFormState) => void) {
  const valueRef          = useRef(value)
  const lastCommittedRef  = useRef(value)
  const historyRef        = useRef<EodFormState[]>([])
  const futureRef         = useRef<EodFormState[]>([])
  const lastCommitTimeRef = useRef(0)
  const lastEditKeyRef    = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (value !== valueRef.current && value !== lastCommittedRef.current) {
      historyRef.current = []
      futureRef.current  = []
      lastEditKeyRef.current    = null
      lastCommitTimeRef.current = 0
    }
    valueRef.current = value
  })

  const historyCommit = useCallback((next: EodFormState) => {
    const now = Date.now()
    const editKey = getEditKey(valueRef.current, next)

    const shouldCoalesce =
      editKey !== null &&
      editKey === lastEditKeyRef.current &&
      (now - lastCommitTimeRef.current) < COALESCE_MS

    if (!shouldCoalesce) {
      historyRef.current.push(valueRef.current)
      if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift()
      futureRef.current = []
      lastEditKeyRef.current = editKey
    }

    lastCommitTimeRef.current = now
    lastCommittedRef.current = next
    onChange(next)
  }, [onChange])

  const handleUndo = useCallback(() => {
    if (historyRef.current.length === 0) return
    futureRef.current.push(valueRef.current)
    const prev = historyRef.current.pop()!
    lastCommitTimeRef.current = 0
    lastEditKeyRef.current = null
    lastCommittedRef.current = prev
    onChange(prev)
  }, [onChange])

  const handleRedo = useCallback(() => {
    if (futureRef.current.length === 0) return
    historyRef.current.push(valueRef.current)
    const next = futureRef.current.pop()!
    lastCommitTimeRef.current = 0
    lastEditKeyRef.current = null
    lastCommittedRef.current = next
    onChange(next)
  }, [onChange])

  // Stable refs so the window listener never goes stale
  const handleUndoRef = useRef(handleUndo)
  const handleRedoRef = useRef(handleRedo)
  useLayoutEffect(() => {
    handleUndoRef.current = handleUndo
    handleRedoRef.current = handleRedo
  })

  // Global listener — fires regardless of which element is focused
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndoRef.current() }
      else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedoRef.current() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return { historyCommit }
}
