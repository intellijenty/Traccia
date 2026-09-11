import { Card, CardContent } from "@/components/ui/card"
import type { PunchStatus } from "@/lib/types"

function formatTimer(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function formatSinceTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: undefined,
    hour12: true,
  })
}

interface StatusCardProps {
  status: PunchStatus
}

export function StatusCard({ status }: StatusCardProps) {
  const isIn = status.isIn
  const hasWorkWindow = !!status.workWindow
  const displaySeconds = hasWorkWindow
    ? status.workingSecondsToday
    : status.totalSecondsToday

  return (
    <Card
      className={`relative overflow-hidden border-0 ${
        isIn
          ? "bg-blue-950/80 text-blue-50"
          : "bg-muted/50 text-muted-foreground"
      }`}
    >
      <CardContent className="p-5 pb-2">
        <div className="flex items-center gap-2 text-xs font-medium tracking-wider uppercase opacity-80">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              isIn
                ? "bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.5)]"
                : "bg-muted-foreground/50"
            }`}
          />
          Status
        </div>
        <div className="mt-2 text-2xl font-bold tracking-tight">
          {isIn ? "CHECKED IN" : "CHECKED OUT"}
        </div>
        {status.lastEntry && (
          <p className="mt-1 text-sm opacity-70">
            Since {formatSinceTime(status.lastEntry.timestamp)}
          </p>
        )}
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="text-xs tracking-wider uppercase opacity-60">
            {hasWorkWindow ? "Working time" : "Time in today"}
          </p>
          <p className="mt-0.5 font-mono text-2xl font-semibold tracking-tight tabular-nums">
            {formatTimer(displaySeconds)}
          </p>
          {/* {hasWorkWindow && status.totalSecondsToday !== status.workingSecondsToday && (
            <p className="mt-1 font-mono text-xs tabular-nums opacity-40">
              Total: {formatTimer(status.totalSecondsToday)}
            </p>
          )} */}
        </div>
      </CardContent>
    </Card>
  )
}
