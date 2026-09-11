import type { PortalEntry } from "@/lib/types"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible"
import { useState } from "react"
import { UnfoldLessIcon } from "@hugeicons/core-free-icons"
import { Card, CardContent } from "./ui/card"
import { HugeiconsIcon } from "@hugeicons/react"

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function formatBreakMins(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatDuration(minutes: number | null, isActive: boolean): string {
  if (isActive) return "running"
  if (minutes === null || minutes === 0) return "<1m"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

interface PortalLogProps {
  entries: PortalEntry[]
}

export function PortalLog({ entries }: PortalLogProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground">No portal punches today</p>
      </div>
    )
  }

  const sorted = [...entries].reverse()

  return (
    <Card className="mx-auto w-full bg-card/25 p-2">
      <CardContent className="p-2">
        <Collapsible
          open={isOpen}
          onOpenChange={setIsOpen}
          className="flex flex-col gap-2"
        >
          <CollapsibleTrigger asChild>
            <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/30 px-3 py-2 hover:cursor-pointer hover:bg-card/80">
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${"bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.5)]"}`}
              />
              <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
                <span className="font-mono text-foreground tabular-nums">
                  {formatTime(sorted[0].intime)}
                </span>
                <span className="text-muted-foreground">→</span>
                <span
                  className={`font-mono tabular-nums ${
                    !sorted[0].outtime ? "text-blue-400" : "text-foreground"
                  }`}
                >
                  {!sorted[0].outtime
                    ? "Active"
                    : formatTime(sorted[0].outtime!)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`font-mono text-xs tabular-nums ${"text-blue-400"}`}
                >
                  {formatDuration(sorted[0].workingmins, !sorted[0].outtime)}
                </span>
                <span
                  className={`font-mono text-xs tabular-nums ${"text-blue-400"}`}
                >
                  <HugeiconsIcon
                    icon={UnfoldLessIcon}
                    className="h-4 text-muted-foreground"
                  />
                </span>
                {sorted[0].ismanual === 1 && (
                  <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                    manual
                  </span>
                )}
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-2">
            {sorted.slice(1).map((entry, i) => {
              const isActive = entry.outtime === null
              // Break between this (older) session's end and the newer session's start
              const prevEntry = sorted[i]
              const breakMins =
                entry.outtime && prevEntry.intime
                  ? Math.floor(
                      (new Date(prevEntry.intime).getTime() -
                        new Date(entry.outtime).getTime()) /
                        60000
                    )
                  : null
              return (
                <div key={i} className="relative">
                  {/* Badge on the boundary */}
                  {breakMins !== null && breakMins > 0 && (
                    <span
                      className={`pointer-events-none absolute text-center ${breakMins < 9 ? "right-29" : "right-28"} -top-4 z-20 rounded-full border border-amber-500/25 bg-amber-500/0 px-2.5 py-1 text-[10px] font-semibold text-amber-400/75 shadow-sm backdrop-blur-sm`}
                    >
                      {formatBreakMins(breakMins)} break
                    </span>
                  )}
                  <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/30 px-3 py-2">
                    <span
                      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                        isActive
                          ? "bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.5)]"
                          : "bg-muted-foreground/40"
                      }`}
                    />
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
                      <span className="font-mono text-foreground tabular-nums">
                        {formatTime(entry.intime)}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span
                        className={`font-mono tabular-nums ${
                          isActive ? "text-blue-400" : "text-foreground"
                        }`}
                      >
                        {isActive ? "Active" : formatTime(entry.outtime!)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          isActive ? "text-blue-400" : "text-muted-foreground"
                        }`}
                      >
                        {formatDuration(entry.workingmins, isActive)}
                      </span>
                      {entry.ismanual === 1 && (
                        <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                          manual
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
