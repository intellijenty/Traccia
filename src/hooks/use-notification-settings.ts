import { useState, useEffect, useCallback } from "react"
import type { TimeSource } from "@/lib/time-source"

const isElectron = typeof window !== "undefined" && !!window.electronAPI

export interface NotificationPrefs {
  dailyTargetMinutes: number
  targetEnabled: boolean
  targetMessage: string
  targetSource: TimeSource
  eodEnabled: boolean
  eodMinutes: number
  eodMessage: string
  eodSource: TimeSource
}

const DEFAULTS: NotificationPrefs = {
  dailyTargetMinutes: 480,
  targetEnabled: false,
  targetMessage: "Target completed for today",
  targetSource: "local",
  eodEnabled: false,
  eodMinutes: 5,
  eodMessage: "EOD Reminder! We are close to reach our target!",
  eodSource: "local",
}

export function useNotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULTS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (isElectron) {
        const raw = await window.electronAPI.getSettings()
        setPrefs({
          dailyTargetMinutes:
            raw.dailyTargetMinutes ?? DEFAULTS.dailyTargetMinutes,
          targetEnabled: raw.notifyTargetEnabled ?? DEFAULTS.targetEnabled,
          targetMessage: raw.notifyTargetMessage || DEFAULTS.targetMessage,
          targetSource:
            (raw.notifyTargetSource as TimeSource) || DEFAULTS.targetSource,
          eodEnabled: raw.notifyEodEnabled ?? DEFAULTS.eodEnabled,
          eodMinutes: raw.notifyEodMinutes ?? DEFAULTS.eodMinutes,
          eodMessage: raw.notifyEodMessage || DEFAULTS.eodMessage,
          eodSource: (raw.notifyEodSource as TimeSource) || DEFAULTS.eodSource,
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  const save = useCallback((updated: Partial<NotificationPrefs>) => {
    setPrefs((prev) => ({ ...prev, ...updated }))
    if (isElectron) {
      window.electronAPI.updateSettings({
        ...(updated.targetEnabled !== undefined && {
          notifyTargetEnabled: updated.targetEnabled,
        }),
        ...(updated.targetMessage !== undefined && {
          notifyTargetMessage: updated.targetMessage,
        }),
        ...(updated.targetSource !== undefined && {
          notifyTargetSource: updated.targetSource,
        }),
        ...(updated.eodEnabled !== undefined && {
          notifyEodEnabled: updated.eodEnabled,
        }),
        ...(updated.eodMinutes !== undefined && {
          notifyEodMinutes: updated.eodMinutes,
        }),
        ...(updated.eodMessage !== undefined && {
          notifyEodMessage: updated.eodMessage,
        }),
        ...(updated.eodSource !== undefined && {
          notifyEodSource: updated.eodSource,
        }),
      } as Parameters<typeof window.electronAPI.updateSettings>[0])
    }
  }, [])

  return { prefs, save, loading }
}
