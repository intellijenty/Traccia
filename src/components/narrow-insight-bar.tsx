import { useMemo } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { HugeiconsIcon } from "@hugeicons/react"
import { Calendar04Icon } from "@hugeicons/core-free-icons"
import { usePortalRange } from "@/hooks/use-portal-range"
import { useDayMarks } from "@/hooks/use-day-marks"
import { usePortalStoreContext } from "@/contexts/portal-store"
import {
  getLocalDate,
  getWeekRange,
  getDaysOfWeek,
  computeWeeklyBalance,
  formatSignedHM,
  formatHM,
} from "@/lib/week-utils"
import {
  getYearMonth,
  getMonthRange,
  getWeekdaysInMonth,
} from "@/lib/month-utils"
import { cn } from "@/lib/utils"

export function NarrowBalanceChips() {
  const today = getLocalDate()
  const weekRange = getWeekRange(today)
  const yearMonth = getYearMonth(today)
  const { connected: portalConnected } = usePortalStoreContext()

  const weekDays = getDaysOfWeek(weekRange.start)
  const monthDays = getWeekdaysInMonth(yearMonth, today)
  const { summaries: weekSummaries } = usePortalRange(weekDays)
  const { summaries: monthSummaries } = usePortalRange(monthDays)
  const { dayMarks } = useDayMarks()

  const { weekBalance } = useMemo(() => {
    // Week balance
    const weekDays = getDaysOfWeek(weekRange.start)
    const wb = computeWeeklyBalance(weekDays, weekSummaries, today, dayMarks)

    // Month balance
    const { start: monthStart, end: monthEnd } = getMonthRange(yearMonth)
    let mWorked = 0
    let mTarget = 0

    for (const s of monthSummaries) {
      if (s.date >= today || s.date < monthStart || s.date > monthEnd) continue
      const dow = new Date(s.date + "T00:00:00").getDay()
      if (dow < 1 || dow > 5) continue
      const mark = dayMarks.get(s.date)
      const autoMP = s.missPunchCount > 0
      if (mark === "fl") {
        mWorked += 8 * 3600
        mTarget += 8 * 3600
      } else if (mark === "hl") {
        mWorked += s.totalSeconds + 4 * 3600
        mTarget += 8 * 3600
      } else if (mark === "mp" || autoMP) {
        // excluded from target
      } else {
        mWorked += s.totalSeconds
        mTarget += 8 * 3600
      }
    }
    for (const [date, mark] of dayMarks) {
      if (date >= today || date < monthStart || date > monthEnd) continue
      if (monthSummaries.some((s) => s.date === date)) continue
      const dow = new Date(date + "T00:00:00").getDay()
      if (dow < 1 || dow > 5) continue
      if (mark === "fl") {
        mWorked += 8 * 3600
        mTarget += 8 * 3600
      } else if (mark === "hl") {
        mWorked += 4 * 3600
        mTarget += 8 * 3600
      }
    }

    return { weekBalance: wb.balance, monthBalance: mWorked - mTarget }
  }, [
    weekSummaries,
    monthSummaries,
    dayMarks,
    today,
    weekRange.start,
    yearMonth,
  ])

  // Hide when not connected or no data yet
  if (!portalConnected) return null

  const wLabel = formatSignedHM(weekBalance)
  // const mLabel = formatSignedHM(monthBalance)

  return (
    <div className="flex items-center gap-2.5">
      {/* Monthly balance */}
      {/* <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex cursor-default items-center gap-1 font-mono text-[11px] tabular-nums",
              monthBalance < 0 ? "text-destructive" : "text-foreground/60"
            )}
          >
            <HugeiconsIcon
              icon={Calendar04Icon}
              size={11}
              className="shrink-0 opacity-60"
            />
            {mLabel}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Month balance: {formatHM(Math.abs(monthBalance))}{" "}
          {monthBalance >= 0 ? "ahead" : "behind"} target
        </TooltipContent>
      </Tooltip> */}

      {/* <span className="text-[10px] text-muted-foreground/20 select-none">|</span> */}

      {/* Weekly balance */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex cursor-default items-center gap-1 font-mono text-[11px] tabular-nums",
              weekBalance < 0 ? "text-destructive" : "text-foreground/80"
            )}
          >
            <HugeiconsIcon
              icon={Calendar04Icon}
              size={11}
              className="shrink-0"
            />
            {wLabel}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Week balance: {formatHM(Math.abs(weekBalance))}{" "}
          {weekBalance >= 0 ? "ahead" : "behind"} (excl. today)
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
