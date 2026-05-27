import { Card, CardContent } from "@/components/ui/card"

function formatHoursMinutes(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return `${hours}h ${String(minutes).padStart(2, "0")}m`
}

function formatBreakDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatCompletionTime(remainingSeconds: number): string {
  const completionDate = new Date(Date.now() + remainingSeconds * 1000)
  return completionDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

interface TotalCardProps {
  totalSeconds: number
  workingSeconds?: number
  isIn: boolean
  targetMinutes?: number
  breakSeconds?: number
}

export function TotalCard({
  totalSeconds,
  workingSeconds,
  isIn,
  targetMinutes = 480,
  breakSeconds = 0,
}: TotalCardProps) {
  const displaySeconds = workingSeconds ?? totalSeconds
  const targetSeconds = targetMinutes * 60
  const remainingSeconds = Math.max(0, targetSeconds - displaySeconds)
  const percentage = Math.min(
    100,
    Math.round((displaySeconds / targetSeconds) * 1000) / 10
  )
  const completed = remainingSeconds === 0

  return (
    <Card className="border-0 bg-muted/50">
      <CardContent className="p-5 pb-1">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Estimated Completion
        </p>
        <p className="mt-2 font-mono text-3xl font-bold tracking-tight tabular-nums">
          {formatCompletionTime(remainingSeconds)}
        </p>
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>0h</span>
            <span>{percentage}%</span>
            <span>{targetMinutes % 60 === 0 ? `${Math.floor(targetMinutes / 60)}h` : `${Math.floor(targetMinutes / 60)}h ${targetMinutes % 60}m`}</span>
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-muted-foreground transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          {completed ? (
            <span className="text-foreground">Target reached!</span>
          ) : (
            <>
              <span className="font-medium text-foreground">
                {formatHoursMinutes(remainingSeconds)}
              </span>
              {" remaining"}
            </>
          )}
        </div>

        {/* Break time */}
        {breakSeconds >= 60 && (
          <div className="mt-3 flex items-center gap-2">
            <p className="text-xs tracking-wider uppercase opacity-35">
              Break
            </p>
            <span className="font-mono font-semibold tabular-nums text-amber-400/70">
              {formatBreakDuration(breakSeconds)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
