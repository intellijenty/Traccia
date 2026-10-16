import type { LeavePerson } from "./types"

const FIRST_HALF = 2
const SECOND_HALF = 3
const DAY_MS = 86_400_000

export type DayPortion = "First half" | "Second half"

export interface LeaveRange {
  start: string
  end: string
}

export interface MergedLeave {
  userId: number
  name: string
  leaveName: string
  portion: DayPortion | null
  totalDays: number
  ranges: LeaveRange[]
}

function toUtcMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}

function isWeekend(ms: number): boolean {
  const day = new Date(ms).getUTCDay()
  return day === 0 || day === 6
}

function dayWeight(
  leave: LeavePerson,
  ms: number,
  startMs: number,
  endMs: number
): number {
  if (isWeekend(ms)) return 0
  if (leave.startType === FIRST_HALF) return ms === startMs ? 0.5 : 0
  if (
    (ms === startMs && leave.startType === SECOND_HALF) ||
    (ms === endMs && leave.endType === FIRST_HALF)
  ) {
    return 0.5
  }
  return 1
}

export function leaveTotalDays(leave: LeavePerson): number {
  const startMs = toUtcMs(leave.startDate)
  const endMs = toUtcMs(leave.endDate ?? leave.startDate)
  let total = 0
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    total += dayWeight(leave, ms, startMs, endMs)
  }
  return total
}

export function portionOn(leave: LeavePerson, date: string): DayPortion | null {
  if (leave.startDate === date && leave.startType === FIRST_HALF)
    return "First half"
  if (leave.startDate === date && leave.startType === SECOND_HALF)
    return "Second half"
  const end = leave.endDate ?? leave.startDate
  if (end === date && leave.endType === FIRST_HALF) {
    return "First half"
  }
  return null
}

export function mergeLeaves(rows: LeavePerson[], today: string): MergedLeave[] {
  const byUser = new Map<number, LeavePerson[]>()
  for (const row of rows) {
    const list = byUser.get(row.userId)
    if (list) list.push(row)
    else byUser.set(row.userId, [row])
  }

  const merged = [...byUser.values()].map((list): MergedLeave => {
    const portions = list.map((row) => portionOn(row, today))
    const leaveNames = [...new Set(list.map((row) => row.leaveName))]
    return {
      userId: list[0].userId,
      name: list[0].name,
      leaveName: leaveNames.join(" / "),
      portion: portions.includes(null) ? null : portions[0],
      totalDays: list.reduce((sum, row) => sum + leaveTotalDays(row), 0),
      ranges: list
        .map((row) => ({
          start: row.startDate,
          end: row.endDate ?? row.startDate,
        }))
        .sort((a, b) => a.start.localeCompare(b.start)),
    }
  })

  return merged.sort((a, b) => a.name.localeCompare(b.name))
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ""
  return (first + last).toUpperCase()
}

export function formatDays(days: number): string {
  return `${Number.isInteger(days) ? days : days.toFixed(1)}d`
}

function formatDay(date: string): string {
  return new Date(toUtcMs(date)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
}

export function formatRange(range: LeaveRange): string {
  return range.start === range.end
    ? formatDay(range.start)
    : `${formatDay(range.start)} – ${formatDay(range.end)}`
}
