export interface EodHolidaysSettings {
  enabled: boolean
  /** How many days ahead to show approved leaves (default: 14, range: 1–90) */
  windowDays: number
}

const KEY = 'traccia:eod-holidays-settings'

const DEFAULTS: EodHolidaysSettings = {
  enabled: true,
  windowDays: 14,
}

export function loadHolidaysSettings(): EodHolidaysSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const p = JSON.parse(raw) as Record<string, unknown>
    return {
      enabled: typeof p.enabled === 'boolean' ? p.enabled : DEFAULTS.enabled,
      windowDays: typeof p.windowDays === 'number' && p.windowDays >= 1
        ? Math.min(90, Math.max(1, Math.round(p.windowDays)))
        : DEFAULTS.windowDays,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveHolidaysSettings(s: EodHolidaysSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}
