export type MeetingRouteTarget = 'project' | 'otherTasks'

export interface MeetingRule {
  id: string
  keywords: string[]
  target: MeetingRouteTarget
  projectName?: string  // only used when target === 'project'
}

export interface EodMeetingsSettings {
  enabled: boolean
  attachDuration: boolean
  excludeKeywords: string[]
  rules: MeetingRule[]
}

const KEY = 'traccia:eod-meetings-settings'

const DEFAULTS: EodMeetingsSettings = {
  enabled: true,
  attachDuration: true,
  excludeKeywords: [],
  rules: [],
}

export function loadMeetingsSettings(): EodMeetingsSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const p = JSON.parse(raw) as Record<string, unknown>
    return {
      enabled: typeof p.enabled === 'boolean' ? p.enabled : DEFAULTS.enabled,
      attachDuration: typeof p.attachDuration === 'boolean' ? p.attachDuration : DEFAULTS.attachDuration,
      excludeKeywords: Array.isArray(p.excludeKeywords)
        ? (p.excludeKeywords as unknown[]).filter((k): k is string => typeof k === 'string')
        : [],
      rules: Array.isArray(p.rules)
        ? (p.rules as Record<string, unknown>[]).flatMap(r => {
            if (!r || typeof r.id !== 'string' || typeof r.target !== 'string') return []
            // Support both old shape (keyword: string) and new shape (keywords: string[])
            const keywords: string[] = Array.isArray(r.keywords)
              ? (r.keywords as unknown[]).filter((k): k is string => typeof k === 'string')
              : typeof r.keyword === 'string' && r.keyword
                ? [r.keyword as string]
                : []
            return [{
              id: r.id,
              keywords,
              target: (r.target === 'project' ? 'project' : 'otherTasks') as MeetingRouteTarget,
              projectName: typeof r.projectName === 'string' ? r.projectName : undefined,
            }]
          })
        : [],
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveMeetingsSettings(s: EodMeetingsSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}
