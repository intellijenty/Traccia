// Persistence for EOD AI personalization settings (renderer-owned, passed to
// the main process per generation run). Mirrors the eod-meetings-settings.ts
// pattern.

export interface EodAiSettings {
  /** blocklist: report everything except the listed paths.
   *  allowlist: report only the listed paths (fail-safe for privacy). */
  filterMode: 'blocklist' | 'allowlist'
  excludedPaths: string[]
  includedPaths: string[]
  /** The user's standing EOD instructions doc — style rules, biases, declared
   *  recurring work. Injected into both AI phases. */
  instructions: string
}

const KEY = 'traccia:eod-ai-settings'

export function makeDefaultEodAiSettings(): EodAiSettings {
  return { filterMode: 'blocklist', excludedPaths: [], includedPaths: [], instructions: '' }
}

function asPathArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).slice(0, 100)
}

export function loadEodAiSettings(): EodAiSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return makeDefaultEodAiSettings()
    const parsed = JSON.parse(raw) as Partial<EodAiSettings>
    return {
      filterMode: parsed.filterMode === 'allowlist' ? 'allowlist' : 'blocklist',
      excludedPaths: asPathArray(parsed.excludedPaths),
      includedPaths: asPathArray(parsed.includedPaths),
      instructions: typeof parsed.instructions === 'string' ? parsed.instructions : '',
    }
  } catch {
    return makeDefaultEodAiSettings()
  }
}

export function saveEodAiSettings(settings: EodAiSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch { /* ignore quota errors */ }
}

/** Paths the active filter mode operates on. */
export function activeFilterPaths(settings: EodAiSettings): string[] {
  return settings.filterMode === 'allowlist' ? settings.includedPaths : settings.excludedPaths
}
