import type { PortalData, PunchEntry } from "./types"

/**
 * The portal lags. Local punches do not. This projects what the portal would
 * report right now, from what it has already synced plus the local record of
 * the time it has not seen yet.
 *
 * Two lag cases, one formula:
 *  - Portal IN: it counts straight from the gate punch-in to now, so it misses
 *    every break taken since. Deduct them.
 *  - Portal OUT: the gate punch-in has not synced, so it counts nothing since
 *    its last outtime. Add the local time since, minus breaks.
 *
 * Every local out-in is a real break, however short. No smoothing.
 *
 * Returns null when there is nothing to project.
 */
export function estimatePortalTotalMinutes(
  portal: PortalData,
  localEvents: PunchEntry[],
  now: number = Date.now()
): number | null {
  // Portal minutes from closed pairs only — drop its own live extrapolation,
  // since the window below replaces it.
  const closedMinutes =
    portal.totalMinutes - (portal.isCurrentlyIn ? portal.activeSessionMinutes : 0)

  const sorted = [...localEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  let windowStart: number | null = null
  if (portal.isCurrentlyIn && portal.lastInTime) {
    // Gate punch-in of the open session. Counting from here keeps the walk
    // from the gate to the desk, which the portal does count.
    windowStart = new Date(portal.lastInTime).getTime()
  } else {
    // Nothing synced since this moment; the gate punch-in that followed it is
    // unknown, so start from the local punch-in instead.
    let boundary = -Infinity
    for (const e of portal.entries) {
      if (e.outtime) boundary = Math.max(boundary, new Date(e.outtime).getTime())
    }
    const firstLogin = sorted.find(
      (e) => e.type === "LOGIN" && new Date(e.timestamp).getTime() > boundary
    )
    windowStart = firstLogin ? new Date(firstLogin.timestamp).getTime() : null
  }

  if (windowStart === null || windowStart >= now) return null

  // Every LOGOUT → LOGOUT-ends-the-day gap inside the window is a break.
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
