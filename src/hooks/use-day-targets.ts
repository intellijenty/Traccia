import { useState, useEffect, useCallback } from "react"
import type { DayTarget, DayTargetType } from "@/lib/types"

const isElectron = typeof window !== "undefined" && !!window.electronAPI

export function useDayTargets() {
  const [targets, setTargets] = useState<Map<string, DayTarget>>(new Map())

  const reload = useCallback(async () => {
    if (!isElectron) return
    const rows = await window.electronAPI.getAllDayTargets()
    setTargets(new Map(rows.map((r) => [r.date, r])))
  }, [])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    if (!isElectron) return
    return window.electronAPI.onEventUpdate(() => reload())
  }, [reload])

  const setTarget = useCallback(
    async (date: string, type: DayTargetType, value: string | null) => {
      setTargets((prev) => {
        const next = new Map(prev)
        next.set(date, { date, type, value })
        return next
      })
      if (isElectron) {
        await window.electronAPI.setDayTarget(date, type, value)
      }
    },
    []
  )

  const deleteTarget = useCallback(async (date: string) => {
    setTargets((prev) => {
      const next = new Map(prev)
      next.delete(date)
      return next
    })
    if (isElectron) {
      await window.electronAPI.deleteDayTarget(date)
    }
  }, [])

  return { dayTargets: targets, setTarget, deleteTarget }
}
