import { Card, CardContent } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { HugeiconsIcon } from "@hugeicons/react"
import { InformationCircleIcon } from "@hugeicons/core-free-icons"

function formatHoursMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}h ${String(m).padStart(2, "0")}m`
}

function formatCompletionTime(remainingMinutes: number): string {
  const completionDate = new Date(Date.now() + remainingMinutes * 60 * 1000)
  return completionDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function formatBreakDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

interface PortalTotalCardProps {
  totalMinutes: number
  isIn: boolean
  targetMinutes?: number
  adjustmentLabel?: string | null
  breakMinutes?: number
  /** Signed correction to portal minutes, estimated from local punches. */
  etaOffsetMinutes?: number
}

export function PortalTotalCard({
  totalMinutes,
  isIn,
  targetMinutes = 480,
  adjustmentLabel = null,
  breakMinutes = 0,
  etaOffsetMinutes = 0,
}: PortalTotalCardProps) {
  const remainingMinutes = Math.max(0, targetMinutes - totalMinutes)
  // ETA runs on the local-corrected total; every other number on this card
  // stays on portal-confirmed time.
  const etaRemainingMinutes = Math.max(
    0,
    targetMinutes - totalMinutes - etaOffsetMinutes
  )
  const percentage = Math.min(
    100,
    Math.round((totalMinutes / targetMinutes) * 1000) / 10
  )
  const completed = remainingMinutes === 0
  const isAdjusted = adjustmentLabel !== null

  return (
    <Card className="border-0 bg-muted/50">
      <CardContent className="p-5 pb-2">
        {/* Label row */}
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {completed ? "Target Completed" : "Portal Completion"}
          </p>
          {isAdjusted && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default text-blue-400/70 hover:text-blue-400">
                  <HugeiconsIcon icon={InformationCircleIcon} size={11} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-50 text-xs">
                {adjustmentLabel}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Primary number */}
        <p className="mt-2 font-mono text-3xl font-bold tracking-tight tabular-nums">
          {(isIn || etaOffsetMinutes > 0) && !completed
            ? formatCompletionTime(etaRemainingMinutes)
            : formatHoursMinutes(totalMinutes)}
        </p>

        {/* Progress bar */}
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>0h</span>
            <span>{percentage}%</span>
            <span>{formatHoursMinutes(targetMinutes).replace("00m", "")}</span>
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all ${completed ? "bg-emerald-500" : "bg-blue-500"}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-3 text-xs text-muted-foreground">
          {completed ? (
            <span className="text-foreground">Target reached!</span>
          ) : (
            <>
              <span className="font-medium text-foreground">
                {formatHoursMinutes(remainingMinutes)}
              </span>
              {" remaining"}
            </>
          )}
        </div>

        {/* Break time */}
        {breakMinutes > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <p className="text-xs tracking-wider uppercase opacity-35">Break</p>
            <span className="px-1 font-mono text-xs font-semibold text-amber-400/70 tabular-nums">
              {formatBreakDuration(breakMinutes)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
