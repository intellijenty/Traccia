export interface PortalMinuteEntry {
  intime: string
  outtime: string | null
  workingmins: number | null
}

export interface PortalDayMinutes {
  totalMinutes: number
  isCurrentlyIn: boolean
  lastInTime: string | null
  activeSessionMinutes: number
}

const MS_PER_MINUTE = 60_000

export function minutesBetween(from: number, to: number): number {
  return Math.max(0, (to - from) / MS_PER_MINUTE)
}

export function openSessionMinutes(intime: string, now: number): number {
  return minutesBetween(new Date(intime).getTime(), now)
}

export function exactPortalMinutes(
  entries: PortalMinuteEntry[],
  now: number,
  excludeOpenInTime: string | null = null
): number {
  let total = 0
  for (const entry of entries) {
    if (entry.workingmins != null) total += entry.workingmins
    if (entry.outtime === null && entry.intime !== excludeOpenInTime) {
      total += openSessionMinutes(entry.intime, now)
    }
  }
  return total
}

export function summarizePortalDay(
  entries: PortalMinuteEntry[],
  now: number = Date.now()
): PortalDayMinutes {
  let lastInTime: string | null = null
  for (const entry of entries) {
    if (entry.outtime === null) lastInTime = entry.intime
  }
  return {
    totalMinutes: Math.floor(exactPortalMinutes(entries, now)),
    isCurrentlyIn: lastInTime !== null,
    lastInTime,
    activeSessionMinutes:
      lastInTime === null ? 0 : Math.floor(openSessionMinutes(lastInTime, now)),
  }
}
