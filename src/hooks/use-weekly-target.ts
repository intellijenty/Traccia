import { useMemo } from "react"
import { usePortalRange } from "@/hooks/use-portal-range"
import { useDayMarks } from "@/hooks/use-day-marks"
import { getLocalDate, getWeekRange, getDaysOfWeek } from "@/lib/week-utils"
import type { DayTarget } from "@/lib/types"

const WEEKLY_TARGET_MIN = 2400 // 40h × 60

function fmtHM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + (m || 0)
}

export interface WeeklyTargetResult {
  /** Today's adjusted daily target in minutes */
  adjustedTargetMinutes: number
  /** True when Mon–today total ≥ 40h */
  weeklyComplete: boolean
  /** Human-readable explanation; null if standard 8h */
  tooltipText: string | null
  /** Whether target differs from the standard 8h */
  isAdjusted: boolean
  /** Whether a user custom target is active (highest priority) */
  isCustom: boolean
  /** For flex-balance type: goal was already met before today started */
  alreadyMet: boolean
  /** How the target was determined */
  source: "standard" | "weekly-adjusted" | "custom"
}

/**
 * Computes today's adjusted daily target.
 *
 * Priority:
 *   1. todayCustomTarget (user-set, any type) — always wins
 *   2. Friday flex adjustment (40h weekly goal)
 *   3. Standard 8h
 *
 * FL and MP marks on today disable custom target — leave system wins.
 * HL mark allows custom target (user is working the half day).
 */
export function useWeeklyTarget(
  todayLiveMinutes = 0,
  todayCustomTarget?: DayTarget | null,
  todayWorkWindowStart?: string | null
): WeeklyTargetResult {
  const today = getLocalDate()
  const weekDays = getDaysOfWeek(getWeekRange(today).start)
  const pastWeekDays = weekDays.filter((d) => d < today)
  const { summaries } = usePortalRange(pastWeekDays)
  const { dayMarks } = useDayMarks()

  return useMemo(() => {
    const workedBeforeToday = summaries
      .filter((s) => s.date < today)
      .reduce((sum, s) => {
        const mark = dayMarks.get(s.date)
        const autoMP = s.missPunchCount > 0
        if (mark === "mp" || (autoMP && mark !== "fl" && mark !== "hl")) return sum
        if (mark === "fl") return sum + 480
        if (mark === "hl") return sum + Math.floor(s.totalSeconds / 60) + 240
        return sum + Math.floor(s.totalSeconds / 60)
      }, 0)

    const totalWorked = workedBeforeToday + todayLiveMinutes
    const weeklyComplete = totalWorked >= WEEKLY_TARGET_MIN

    const todayMark = dayMarks.get(today)

    // ── Custom target (highest priority) ──────────────────────────────────────
    if (todayCustomTarget) {
      // FL/MP: leave system wins, ignore custom target
      if (todayMark === "fl" || todayMark === "mp") {
        return {
          adjustedTargetMinutes: 480,
          weeklyComplete,
          tooltipText: null,
          isAdjusted: false,
          isCustom: false,
          alreadyMet: false,
          source: "standard",
        }
      }

      let minutes = 480
      let alreadyMet = false

      switch (todayCustomTarget.type) {
        case "fixed": {
          minutes = Math.max(0, parseInt(todayCustomTarget.value ?? "480", 10))
          break
        }
        case "end-time": {
          const now = new Date()
          const nowMins = now.getHours() * 60 + now.getMinutes()
          const endMins = timeToMinutes(todayCustomTarget.value ?? "17:30")
          const remaining = Math.max(0, endMins - nowMins)
          minutes = todayLiveMinutes + remaining
          alreadyMet = remaining === 0
          break
        }
        case "flex-balance": {
          const flexGoal = parseInt(todayCustomTarget.value ?? "0", 10)
          const pastWorkingDays = summaries.filter((s) => {
            if (s.date >= today) return false
            const mark = dayMarks.get(s.date)
            const autoMP = s.missPunchCount > 0
            return !(mark === "mp" || (autoMP && mark !== "fl" && mark !== "hl"))
          }).length
          const weekBalanceMinutes = workedBeforeToday - pastWorkingDays * 480
          const raw = 480 + flexGoal - weekBalanceMinutes
          minutes = Math.max(0, raw)
          alreadyMet = raw <= 0
          break
        }
        case "relative-offset": {
          const offset = parseInt(todayCustomTarget.value ?? "0", 10)
          minutes = Math.max(0, 480 + offset)
          break
        }
        case "weekly-distribute": {
          const allWeekDays = getDaysOfWeek(getWeekRange(today).start)
          const remainingWorkdays = allWeekDays.filter((d) => {
            const dow = new Date(d + "T00:00:00").getDay()
            if (dow < 1 || dow > 5) return false
            if (d < today) return false
            const m = dayMarks.get(d)
            return m !== "fl" && m !== "mp"
          }).length
          const remaining = Math.max(0, WEEKLY_TARGET_MIN - workedBeforeToday)
          minutes = remainingWorkdays > 0 ? Math.round(remaining / remainingWorkdays) : 480
          alreadyMet = remaining <= 0
          break
        }
      }

      const tooltipText = buildCustomTooltip(todayCustomTarget, minutes, alreadyMet, workedBeforeToday)

      return {
        adjustedTargetMinutes: minutes,
        weeklyComplete,
        tooltipText,
        isAdjusted: true,
        isCustom: true,
        alreadyMet,
        source: "custom",
      }
    }

    // ── Standard / Friday adjustment ──────────────────────────────────────────
    const dow = new Date(`${today}T00:00:00`).getDay()
    const isFriday = dow === 5

    if (!isFriday) {
      return {
        adjustedTargetMinutes: 480,
        weeklyComplete,
        tooltipText: null,
        isAdjusted: false,
        isCustom: false,
        alreadyMet: false,
        source: "standard",
      }
    }

    const floor = todayMark === "hl" ? 240 : 360
    const remaining = Math.max(0, WEEKLY_TARGET_MIN - workedBeforeToday)
    const adjusted = Math.max(floor, remaining)
    const isAdjusted = adjusted !== 480

    let tooltipText: string | null = null
    if (remaining <= 0) {
      tooltipText = "All done for the week."
    } else if (remaining > 480) {
      tooltipText = `Target Extended to ${fmtHM(adjusted)}. Today needs a bit extra to reach weekly target.`
    } else {
      tooltipText = `Target Reduced to ${fmtHM(adjusted)}.${adjusted !== remaining ? ` Only ${fmtHM(remaining)} needed to hit weekly target.` : ""}`
    }

    return {
      adjustedTargetMinutes: adjusted,
      weeklyComplete,
      tooltipText,
      isAdjusted,
      isCustom: false,
      alreadyMet: false,
      source: "weekly-adjusted",
    }
  }, [summaries, dayMarks, today, todayLiveMinutes, todayCustomTarget])
}

function buildCustomTooltip(
  target: DayTarget,
  resolvedMinutes: number,
  alreadyMet: boolean,
  workedBeforeToday?: number
): string {
  switch (target.type) {
    case "relative-offset": {
      const v = parseInt(target.value ?? "0", 10)
      const sign = v >= 0 ? "+" : "−"
      const abs = Math.abs(v)
      const label = abs === 0 ? "±0" : `${sign}${fmtHM(abs)}`
      return `${label} · ${fmtHM(resolvedMinutes)} today`
    }
    case "fixed":
      return `Fixed · ${fmtHM(resolvedMinutes)}`
    case "end-time":
      return `Leave at ${target.value ?? "?"}`
    case "flex-balance": {
      const sign = parseInt(target.value ?? "0", 10)
      const label = sign > 0 ? `+${fmtHM(sign)}` : sign < 0 ? `-${fmtHM(Math.abs(sign))}` : "±0"
      if (alreadyMet) return `Flex goal ${label} — already met`
      return `Flex goal ${label} · ${fmtHM(resolvedMinutes)} today`
    }
    case "weekly-distribute": {
      if (alreadyMet) return "Distribute — weekly target complete"
      const remaining = Math.max(0, WEEKLY_TARGET_MIN - (workedBeforeToday ?? 0))
      return `Distribute · ${fmtHM(remaining)} left = ${fmtHM(resolvedMinutes)} today`
    }
  }
}
