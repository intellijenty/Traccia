import { useState, useEffect, useCallback } from "react"
import type { DayWorkWindow, WorkWindowSource } from "@/lib/types"

const isElectron = typeof window !== "undefined" && !!window.electronAPI

export function useWorkWindows() {
  const [windows, setWindows] = useState<Map<string, DayWorkWindow>>(new Map())
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    if (isElectron) {
      const rows = await window.electronAPI.getAllWorkWindows()
      setWindows(new Map(rows.map((r) => [r.date, r])))
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (!isElectron) return
    return window.electronAPI.onEventUpdate(() => reload())
  }, [reload])

  const setWorkWindow = useCallback(
    async (
      date: string,
      startTime: string,
      endTime: string,
      source: WorkWindowSource
    ) => {
      if (isElectron) {
        await window.electronAPI.setWorkWindow(date, startTime, endTime, source)
      }
      setWindows((prev) => {
        const next = new Map(prev)
        next.set(date, {
          date,
          start_time: startTime || null,
          end_time: endTime || null,
          source,
        })
        return next
      })
    },
    []
  )

  const deleteWorkWindow = useCallback(async (date: string) => {
    if (isElectron) {
      await window.electronAPI.deleteWorkWindow(date)
    }
    setWindows((prev) => {
      const next = new Map(prev)
      next.delete(date)
      return next
    })
  }, [])

  return { workWindows: windows, setWorkWindow, deleteWorkWindow, loaded }
}
