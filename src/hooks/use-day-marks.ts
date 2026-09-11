import { useState, useEffect, useCallback } from "react"
import type { DayMark } from "@/lib/week-utils"

const isElectron = typeof window !== "undefined" && !!window.electronAPI
const STORAGE_KEY = "dayMarks"

// Dev-mode fallback: localStorage
function loadFromStorage(): Map<string, DayMark> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    return new Map(Object.entries(JSON.parse(raw)) as [string, DayMark][])
  } catch {
    return new Map()
  }
}

function saveToStorage(marks: Map<string, DayMark>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(marks)))
}

export function useDayMarks() {
  const [marks, setMarks] = useState<Map<string, DayMark>>(new Map())
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    if (isElectron) {
      const rows = await window.electronAPI.getDayMarks()
      setMarks(new Map(rows.map((r) => [r.date, r.mark as DayMark])))
    } else {
      setMarks(loadFromStorage())
    }
    setLoaded(true)
  }, [])

  // Load persisted marks on mount
  useEffect(() => {
    reload()
  }, [reload])

  // Re-sync whenever the main process signals a data change (e.g. leave sync)
  useEffect(() => {
    if (!isElectron) return
    return window.electronAPI.onEventUpdate(() => reload())
  }, [reload])

  // Cycle: none → mp → fl → hl → none
  const cycleMark = useCallback((date: string) => {
    setMarks((prev) => {
      const next = new Map(prev)
      const current = next.get(date)
      let newMark: DayMark | null

      if (!current) newMark = "mp"
      else if (current === "mp") newMark = "fl"
      else if (current === "fl") newMark = "hl"
      else newMark = null

      if (newMark) {
        next.set(date, newMark)
        if (isElectron) window.electronAPI.setDayMark(date, newMark)
      } else {
        next.delete(date)
        if (isElectron) window.electronAPI.deleteDayMark(date)
      }

      if (!isElectron) saveToStorage(next)
      return next
    })
  }, [])

  // Direct set: pass null to clear the mark
  const setMark = useCallback((date: string, mark: DayMark | null) => {
    setMarks((prev) => {
      const next = new Map(prev)
      if (mark) {
        next.set(date, mark)
        if (isElectron) window.electronAPI.setDayMark(date, mark)
      } else {
        next.delete(date)
        if (isElectron) window.electronAPI.deleteDayMark(date)
      }
      if (!isElectron) saveToStorage(next)
      return next
    })
  }, [])

  return { dayMarks: marks, cycleMark, setMark, loaded }
}
