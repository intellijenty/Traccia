import { useState, useEffect, useCallback } from "react"

const isElectron = typeof window !== "undefined" && !!window.electronAPI

export interface GeneralSettings {
  autoStart: boolean
  workBoundaryStart: string // "HH:MM" or ""
  workBoundaryEnd: string // "HH:MM" or ""
  nightShiftEnabled: boolean
  nightShiftStart: string
  nightShiftEnd: string
}

const DEFAULTS: GeneralSettings = {
  autoStart: true,
  workBoundaryStart: "",
  workBoundaryEnd: "",
  nightShiftEnabled: false,
  nightShiftStart: "22:00",
  nightShiftEnd: "06:00",
}

function parseSettings(
  raw: Awaited<ReturnType<typeof window.electronAPI.getSettings>>
): GeneralSettings {
  return {
    autoStart: raw.autoStart ?? DEFAULTS.autoStart,
    workBoundaryStart: raw.workBoundaryStart ?? "",
    workBoundaryEnd: raw.workBoundaryEnd ?? "",
    nightShiftEnabled: raw.nightShiftEnabled ?? false,
    nightShiftStart: raw.nightShiftStart ?? "22:00",
    nightShiftEnd: raw.nightShiftEnd ?? "06:00",
  }
}

export function useGeneralSettings() {
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULTS)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (isElectron) {
      const raw = await window.electronAPI.getSettings()
      setSettings(parseSettings(raw))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // Re-sync when main process signals a data change (e.g. settings saved by another hook instance)
  useEffect(() => {
    if (!isElectron) return
    return window.electronAPI.onEventUpdate(() => reload())
  }, [reload])

  const save = useCallback(async (updated: GeneralSettings) => {
    setSettings(updated)
    if (isElectron) {
      await window.electronAPI.updateSettings({
        autoStart: updated.autoStart,
        workBoundaryStart: updated.workBoundaryStart,
        workBoundaryEnd: updated.workBoundaryEnd,
        nightShiftEnabled: updated.nightShiftEnabled,
        nightShiftStart: updated.nightShiftStart,
        nightShiftEnd: updated.nightShiftEnd,
      } as Parameters<typeof window.electronAPI.updateSettings>[0])
    }
  }, [])

  return { settings, save, loading }
}
