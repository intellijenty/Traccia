import type { WeekDaySummary } from "@/lib/types"
import type { DayMark } from "@/lib/week-utils"
import {
  computeWeeklyBalance,
  formatHM,
  formatSignedHM,
  getLocalDate,
  getWeekRange,
} from "@/lib/week-utils"
import { getYearMonth, getMonthRange, getWeeksOfMonth } from "@/lib/month-utils"

interface MonthlyInsightsProps {
  monthSummaries: WeekDaySummary[]
  selectedDate: string
  dayMarks: Map<string, DayMark>
  onSelectDate: (date: string) => void
}

export function MonthlyInsights({
  monthSummaries,
  selectedDate,
  dayMarks,
  onSelectDate,
}: MonthlyInsightsProps) {
  const today = getLocalDate()
  const yearMonth = getYearMonth(selectedDate)
  const { start, end } = getMonthRange(yearMonth)
  const weeks = getWeeksOfMonth(yearMonth)
  const selectedWeekStart = getWeekRange(selectedDate).start

  // Monthly totals (excluding today, MP; FL=8h, HL=portal+4h)
  let totalWorked = 0
  let workingDays = 0
  let mpDays = 0

  for (const s of monthSummaries) {
    if (s.date >= today) continue
    if (s.date < start || s.date > end) continue
    const dow = new Date(s.date + "T00:00:00").getDay()
    if (dow < 1 || dow > 5) continue

    const mark = dayMarks.get(s.date)
    const autoMP = s.missPunchCount > 0
    if (mark === "fl") {
      workingDays++
      totalWorked += 8 * 3600
    } else if (mark === "hl") {
      workingDays++
      totalWorked += s.totalSeconds + 4 * 3600
    } else if (mark === "mp" || autoMP) {
      mpDays++
    } else {
      workingDays++
      totalWorked += s.totalSeconds
    }
  }

  // Also count marked days with no portal data
  for (const [date, mark] of dayMarks) {
    if (date >= today || date < start || date > end) continue
    if (monthSummaries.some((s) => s.date === date)) continue
    const dow = new Date(date + "T00:00:00").getDay()
    if (dow < 1 || dow > 5) continue
    if (mark === "fl") {
      workingDays++
      totalWorked += 8 * 3600
    } else if (mark === "hl") {
      workingDays++
      totalWorked += 4 * 3600
    } else if (mark === "mp") {
      mpDays++
    }
  }

  const dailyAvg = workingDays > 0 ? Math.floor(totalWorked / workingDays) : 0

  // Per-week balances — only count days that fall within this month
  const weekRows = weeks
    .map((weekDays, i) => {
      // Clamp to only dates within the displayed month
      const monthDays = weekDays.filter((d) => d >= start && d <= end)
      const hasData = monthDays.some((d) => d < today)
      if (!hasData) return null
      const weekSummaries = monthSummaries.filter((s) =>
        monthDays.includes(s.date)
      )
      const wb = computeWeeklyBalance(monthDays, weekSummaries, today, dayMarks)
      if (wb.workingDays === 0 && wb.mpDays === 0) return null
      return { index: i, weekDays: monthDays, ...wb }
    })
    .filter(Boolean) as Array<{
    index: number
    weekDays: string[]
    balance: number
    workingDays: number
    mpDays: number
    leaveDays: number
    totalWorked: number
    effectiveTarget: number
  }>

  return (
    <div className="space-y-4">
      {/* Monthly summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-card bg-muted/30 px-3 py-2.5">
          <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Monthly Total
          </p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
            {formatHM(totalWorked)}
          </p>
        </div>
        <div className="rounded-lg border border-card bg-muted/30 px-3 py-2.5">
          <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Daily Average
          </p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
            {formatHM(dailyAvg)}
          </p>
        </div>
      </div>

      {/* Per-week balance */}
      <div>
        <p className="mb-2 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          Weekly Balances
        </p>
        <div className="space-y-1">
          {weekRows.map((wb) => {
            const isCurrentWeek = wb.weekDays[0] === selectedWeekStart
            const label = `W${wb.index + 1}`
            const firstDay = wb.weekDays[0]
            const weekStart = new Date(
              firstDay + "T00:00:00"
            ).toLocaleDateString("en-US", { month: "short", day: "numeric" })

            return (
              <button
                key={wb.index}
                onClick={() => onSelectDate(firstDay)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                  isCurrentWeek ? "bg-muted/60" : "hover:bg-muted/30"
                }`}
              >
                <span className="w-7 shrink-0 font-semibold">{label}</span>
                <span className="flex-1 text-left text-[10px]">
                  {weekStart}
                </span>
                <span
                  className={`font-mono text-xs font-medium tabular-nums ${
                    wb.balance >= 0 ? "text-emerald-300" : "text-red-400"
                  }`}
                >
                  {formatSignedHM(wb.balance)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Footnote */}
      <p className="text-[10px] text-muted-foreground">
        {workingDays}d worked
        {mpDays > 0 ? ` · ${mpDays} MP` : ""}
        {" · "} {today >= start && today <= end && "excludes today"}
      </p>
    </div>
  )
}
