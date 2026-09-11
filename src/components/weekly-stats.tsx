import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { WeekDaySummary } from "@/lib/types"
import {
  getDaysOfWeek,
  getWeekRange,
  getDayStatus,
  computeWeeklyBalance,
  formatHM,
  formatSignedHM,
  getLocalDate,
  type DayMark,
} from "@/lib/week-utils"

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"]

const chartConfig = {
  hours: { label: "Hours" },
} satisfies ChartConfig

// Bar fill colours
const C: Record<string, string> = {
  surplus: "#10b981",
  deficit: "#f59e0b",
  critical: "#ef4444",
  today: "#818cf8",
  mp: "rgba(239,68,68,0.28)",
  fl: "rgba(139,92,246,0.35)",
  hl: "rgba(56,189,248,0.38)",
  empty: "rgba(255,255,255,0.04)",
}

interface WeeklyStatsProps {
  weekSummaries: WeekDaySummary[]
  selectedDate: string
  dayMarks: Map<string, DayMark>
  onCycleMark: (date: string) => void // kept for prop-compat; marks use context menu
}

export function WeeklyStats({
  weekSummaries,
  selectedDate,
  dayMarks,
}: WeeklyStatsProps) {
  const today = getLocalDate()
  const weekRange = getWeekRange(selectedDate)
  const days = getDaysOfWeek(weekRange.start)
  const summaryMap = new Map(weekSummaries.map((s) => [s.date, s]))

  const wb = computeWeeklyBalance(days, weekSummaries, today, dayMarks)
  const weekPct =
    wb.effectiveTarget > 0
      ? Math.min(100, Math.round((wb.totalWorked / wb.effectiveTarget) * 100))
      : 0

  // ── Chart data (Mon–Fri) ──────────────────────────────────────────────────
  const chartData = days.slice(0, 5).map((date, i) => {
    const isToday = date === today
    const isFuture = date > today
    const summary = summaryMap.get(date)
    const mark = dayMarks.get(date)
    const autoMP = (summary?.missPunchCount ?? 0) > 0
    const isMP = mark === "mp" || (autoMP && mark !== "fl" && mark !== "hl")
    const isFL = mark === "fl"
    const isHL = mark === "hl"

    const portalSecs = summary?.totalSeconds ?? 0
    const displaySecs = isMP
      ? 0
      : isFL
        ? 8 * 3600
        : isHL
          ? portalSecs + 4 * 3600
          : portalSecs
    const hours = displaySecs / 3600
    const diff = displaySecs - 8 * 3600

    const status = isMP
      ? "mp"
      : isFL
        ? "fl"
        : isHL
          ? "hl"
          : isToday
            ? "today"
            : getDayStatus(displaySecs)

    const hasBar = !isFuture && (isFL || hours > 0)

    // Display label for the day grid cell
    const displayHours = isFuture
      ? "—"
      : isMP
        ? "MP"
        : isFL
          ? "FL"
          : hours > 0
            ? formatHM(displaySecs)
            : "—"

    return {
      label: DAY_LABELS[i],
      date,
      hours: hasBar ? hours : 0,
      displaySecs,
      displayHours,
      diff,
      fill: hasBar ? (C[status] ?? C.empty) : C.empty,
      isToday,
      isFuture,
      isMP,
      isFL,
      isHL,
      hasBar,
    }
  })

  const yMax = Math.max(10, ...chartData.map((d) => d.hours))

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5" data-tour="weekly-stats">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            This Week
          </p>
          <div className="flex items-end gap-2">
            <p className="mt-1 font-mono text-3xl leading-none font-bold tracking-tight tabular-nums">
              {formatHM(wb.totalWorked)}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground/60">
              of {formatHM(wb.effectiveTarget).replace("00m", "0m")}
              {(wb.mpDays > 0 || wb.leaveDays > 0) && (
                <span className="ml-1 opacity-60">(target adjusted)</span>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border-2 border-card bg-muted/30 px-3 py-2.5">
            <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              Daily Average
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {wb.pastWorkingDays > 0
                ? formatHM(Math.round(wb.workedPast / wb.pastWorkingDays))
                : "0h"}
            </p>
          </div>
          <div
            className="rounded-lg border-2 border-card bg-muted/30 px-3 py-2.5"
            data-tour="flex-balance"
          >
            <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              Flex Balance
            </p>
            <p
              className={cn(
                "mt-1 font-mono text-lg font-semibold tabular-nums",
                wb.balance > 0 && "text-emerald-400",
                wb.balance < 0 && "text-amber-400"
              )}
            >
              {wb.balance ? formatSignedHM(wb.balance) : "0h"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Progress bar ───────────────────────────────────────────────────── */}
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-muted/60"
        data-tour="weekly-progress"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            weekPct >= 100 ? "bg-emerald-500" : "bg-accent-foreground"
          )}
          style={{ width: `${weekPct}%` }}
        />
      </div>

      {/* ── Chart card ─────────────────────────────────────────────────────── */}
      <Card className="border-muted/30 bg-muted/20 p-5">
        <div className="space-y-4">
          <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Daily Hours
          </h3>

          <ChartContainer config={chartConfig} className={cn("h-50 w-full")}>
            <BarChart
              accessibilityLayer
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              barCategoryGap="28%"
            >
              <CartesianGrid
                vertical={false}
                horizontal
                strokeDasharray="0"
                stroke="rgba(100,116,139,0.08)"
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{
                  fontSize: 12,
                  fill: "var(--color-muted-foreground)",
                  fontWeight: 500,
                }}
              />
              <YAxis
                domain={[0, Math.ceil(yMax)]}
                width={32}
                tickLine={false}
                axisLine={false}
                tick={{
                  fontSize: 11,
                  fill: "var(--color-muted-foreground)",
                }}
                tickFormatter={(v: number) => `${v}h`}
              />
              <ReferenceLine
                y={8}
                stroke="rgba(100,116,139,0.18)"
                strokeDasharray="2 4"
                label={{
                  value: "Target",
                  position: "insideTopRight",
                  fill: "var(--color-muted-foreground)",
                  fontSize: 11,
                  fontWeight: 500,
                }}
              />
              <ChartTooltip
                cursor={false}
                isAnimationActive={true}
                animationDuration={300}
                animationEasing="ease"
                useTranslate3d={true}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as (typeof chartData)[0]
                  if (d.isFuture) return null
                  return (
                    <div className="dark relative min-w-30 overflow-hidden rounded-lg px-3 py-2.5 text-xs shadow-lg ring-1 ring-foreground/5 before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-background/90 before:backdrop-blur-2xl before:backdrop-saturate-150">
                      <p className="font-semibold text-foreground">{d.label}</p>
                      {d.isMP ? (
                        <p className="mt-1 font-medium text-red-400">
                          Miss Punch
                        </p>
                      ) : d.isFL ? (
                        <p className="mt-1 font-medium text-violet-400">
                          Full Leave
                        </p>
                      ) : d.hasBar ? (
                        <>
                          <p className="mt-1 font-mono text-sm font-bold tabular-nums">
                            {formatHM(d.displaySecs)}
                          </p>
                          {!d.isToday && (
                            <p
                              className={cn(
                                "mt-1 font-mono font-medium tabular-nums",
                                d.diff >= 0
                                  ? "text-emerald-500"
                                  : "text-amber-500"
                              )}
                            >
                              {formatSignedHM(d.diff)}
                            </p>
                          )}
                          {d.isHL && (
                            <p className="mt-0.5 text-sky-400">Half Leave</p>
                          )}
                        </>
                      ) : (
                        <p className="mt-1 text-muted-foreground/50">No data</p>
                      )}
                    </div>
                  )
                }}
              />
              <Bar dataKey="hours" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>

          {/* ── Day detail boxes ─────────────────────────────────────────── */}
          <div className="grid grid-cols-5 gap-2 pr-2 pl-8">
            {chartData.map((d) => {
              const showDiff =
                d.hasBar && !d.isMP && !d.isFL && !d.isToday && d.hours > 0
              return (
                <div
                  key={d.date}
                  className={cn(
                    "rounded-md border transition-colors",
                    d.isToday
                      ? "border-indigo-500/30 bg-indigo-500/5"
                      : d.isFuture
                        ? "border-muted/15 bg-muted/20"
                        : "border-muted/25 bg-muted/30"
                  )}
                >
                  <div className="px-2 py-2 text-center">
                    <p
                      className={cn(
                        "mt-1 font-mono text-xs font-bold tabular-nums",
                        d.isMP
                          ? "text-red-400"
                          : d.isFL
                            ? "text-violet-400"
                            : d.isFuture || !d.hasBar
                              ? "text-muted-foreground/30"
                              : "text-foreground"
                      )}
                    >
                      {d.displayHours}
                    </p>
                    {showDiff ? (
                      <p
                        className={cn(
                          "mt-1 font-mono text-[10px] font-semibold tabular-nums",
                          d.diff == 0
                            ? "text-primary-foreground"
                            : d.diff > 0
                              ? "text-emerald-400"
                              : d.diff > -3600
                                ? "text-amber-400"
                                : "text-red-400"
                        )}
                      >
                        {d.diff == 0 ? "0m" : formatSignedHM(d.diff)}
                      </p>
                    ) : (
                      <p className="mt-1 text-[10px] text-transparent select-none">
                        ·
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Card>
    </div>
  )
}
