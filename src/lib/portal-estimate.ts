import type { PortalData, PunchEntry } from "./types"

export function estimatePortalTotalMinutes(
  portal: PortalData,
  localEvents: PunchEntry[],
  now: number = Date.now()
): number | null {
  const closedMinutes =
    portal.totalMinutes -
    (portal.isCurrentlyIn ? portal.activeSessionMinutes : 0)

  const sorted = [...localEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  let windowStart: number | null = null
  if (portal.isCurrentlyIn && portal.lastInTime) {
    windowStart = new Date(portal.lastInTime).getTime()
  } else {
    let boundary = -Infinity
    for (const e of portal.entries) {
      if (e.outtime)
        boundary = Math.max(boundary, new Date(e.outtime).getTime())
    }
    const firstLogin = sorted.find(
      (e) => e.type === "LOGIN" && new Date(e.timestamp).getTime() > boundary
    )
    windowStart = firstLogin ? new Date(firstLogin.timestamp).getTime() : null
  }

  if (windowStart === null || windowStart >= now) return null

  let breakMs = 0
  let lastLogout: number | null = null
  for (const ev of sorted) {
    const t = new Date(ev.timestamp).getTime()
    if (ev.type === "LOGOUT") {
      lastLogout = t
    } else if (lastLogout !== null) {
      breakMs += overlap(lastLogout, t, windowStart, now)
      lastLogout = null
    }
  }
  if (lastLogout !== null) breakMs += overlap(lastLogout, now, windowStart, now)

  const workedMs = Math.max(0, now - windowStart - breakMs)
  return closedMinutes + Math.floor(workedMs / 60_000)
}

function overlap(start: number, end: number, lo: number, hi: number): number {
  return Math.max(0, Math.min(end, hi) - Math.max(start, lo))
}
