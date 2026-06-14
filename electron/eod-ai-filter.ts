// Project filter for EOD AI evidence. Applied in the main process BEFORE any
// prompt is built — excluded projects never reach the model (hard guarantee,
// not a model instruction). Case-insensitive path-prefix matching: a filter
// entry matches the path itself and everything under it.

export type EodAiFilterMode = 'blocklist' | 'allowlist'

function normPath(p: string): string {
  return p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

/**
 * Returns a predicate deciding whether a project path's evidence is kept.
 * Blocklist: keep unless matched; empty list or unknown path keeps everything.
 * Allowlist: keep only if matched; empty list or unknown path keeps NOTHING
 * (fail-safe — new/unidentified projects can never leak into a report).
 */
export function makeProjectFilter(
  mode: EodAiFilterMode,
  filterPaths: string[],
): (candidate: string) => boolean {
  const normalized = filterPaths.map(normPath).filter(Boolean)
  const matches = (candidate: string): boolean => {
    const c = normPath(candidate)
    return normalized.some(f => c === f || c.startsWith(f + '\\'))
  }
  if (mode === 'blocklist') {
    return candidate => !candidate || normalized.length === 0 || !matches(candidate)
  }
  return candidate => !!candidate && matches(candidate)
}
