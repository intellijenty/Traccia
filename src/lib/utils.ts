import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Total break minutes between consecutive portal sessions (excludes trailing out-time). */
export function computePortalBreakMinutes(
  entries: { intime: string; outtime: string | null }[]
): number {
  if (entries.length < 2) return 0
  const sorted = [...entries].sort(
    (a, b) => new Date(a.intime).getTime() - new Date(b.intime).getTime()
  )
  let total = 0
  for (let i = 0; i < sorted.length - 1; i++) {
    const out = sorted[i].outtime
    if (!out) continue
    const gap = Math.floor(
      (new Date(sorted[i + 1].intime).getTime() - new Date(out).getTime()) /
        60000
    )
    if (gap > 0) total += gap
  }
  return total
}

export function isTimestampInWindow(
  timestamp: string,
  workWindow: { start: string; end: string } | null,
  workMode: string
): boolean {
  if (workMode !== "window" || !workWindow) return true
  const d = new Date(timestamp)
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  if (workWindow.start <= workWindow.end) {
    return hhmm >= workWindow.start && hhmm < workWindow.end
  }
  // Wrapped window (e.g. 22:00–06:00 night shift)
  return hhmm >= workWindow.start || hhmm < workWindow.end
}

/** Total break seconds between consecutive local LOGIN/LOGOUT events within work window. */
export function computeLocalBreakSeconds(
  events: { timestamp: string; type: string }[],
  workWindow?: { start: string; end: string } | null,
  workMode?: string
): number {
  if (workMode === "holiday") return 0
  const filtered =
    workMode === "window" && workWindow
      ? events.filter((e) =>
          isTimestampInWindow(e.timestamp, workWindow, workMode)
        )
      : events
  const sorted = [...filtered].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  let total = 0
  let lastLogout: string | null = null
  for (const ev of sorted) {
    if (ev.type === "LOGOUT") {
      lastLogout = ev.timestamp
    } else if (ev.type === "LOGIN" && lastLogout !== null) {
      const gap = Math.floor(
        (new Date(ev.timestamp).getTime() - new Date(lastLogout).getTime()) /
          1000
      )
      if (gap > 0) total += gap
      lastLogout = null
    }
  }
  return total
}

export function relativeTime(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 20) return "few seconds ago"
  if (secs < 60) return `${secs} seconds ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}m ago` : `${hrs}h ago`
}
