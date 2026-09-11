import { useState } from "react"
import { EventLogItem } from "@/components/event-log-item"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert01Icon, Delete02Icon } from "@hugeicons/core-free-icons"
import type { PunchEntry, WorkWindow } from "@/lib/types"

interface EventLogProps {
  entries: PunchEntry[]
  workWindow?: WorkWindow | null
  workMode?: "holiday" | "all" | "window"
  onDelete: (id: number) => Promise<void>
  onDeletePair: (id1: number, id2: number) => Promise<void>
  onEdit: (
    id: number,
    updates: { timestamp?: string; notes?: string }
  ) => Promise<void>
}

function findCorruptedIds(sorted: PunchEntry[]): Set<number> {
  const ids = new Set<number>()
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].type === sorted[i - 1].type) {
      ids.add(sorted[i].id)
      ids.add(sorted[i - 1].id)
    }
  }
  return ids
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

// Floating badge — rendered absolutely at the top of the lower entry's wrapper
function InterEntryBadge({
  upper,
  lower,
  onDeletePair,
}: {
  upper: PunchEntry
  lower: PunchEntry
  onDeletePair: () => Promise<void>
}) {
  const durationSecs = Math.floor(
    (new Date(upper.timestamp).getTime() -
      new Date(lower.timestamp).getTime()) /
      1000
  )

  const isSession = upper.type === "LOGOUT" && lower.type === "LOGIN"
  const isBreak = upper.type === "LOGIN" && lower.type === "LOGOUT"
  if (!isSession && !isBreak) return null

  const label = `${formatDuration(durationSecs)} ${isSession ? "session" : "break"}`

  const colorClass = isSession
    ? "border-blue-500/25 text-blue-400/75 hover:border-red-500/50 hover:text-red-400"
    : "border-amber-500/25 text-amber-400/75 hover:border-red-500/50 hover:text-red-400"

  const deleteDescription = isSession
    ? `${formatTime(lower.timestamp)} → ${formatTime(upper.timestamp)} (${formatDuration(durationSecs)})`
    : `${formatTime(lower.timestamp)} → ${formatTime(upper.timestamp)} (${formatDuration(durationSecs)})`

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          aria-label={isSession ? "Delete session" : "Delete break"}
          className={`group/badge grid cursor-pointer place-items-center rounded-full border bg-card px-3 py-1.5 text-xs font-semibold tabular-nums shadow-sm backdrop-blur-sm transition-[border-color,color] duration-300 ease-out ${colorClass} `}
        >
          <span className="col-start-1 row-start-1 whitespace-nowrap transition-opacity duration-200 ease-out group-hover/badge:opacity-0">
            {label}
          </span>
          <span className="col-start-1 row-start-1 opacity-0 transition-opacity delay-75 duration-200 ease-out group-hover/badge:opacity-100">
            <HugeiconsIcon icon={Delete02Icon} size={16} />
          </span>
        </button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {isSession ? "session" : "break entries"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-primary-foreground">
            {deleteDescription} <br />{" "}
            <span className="text-muted-foreground">
              This cannot be undone.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDeletePair}
            className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
          >
            Delete both
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
function renderList(
  list: PunchEntry[],
  corruptedIds: Set<number>,
  workWindow: WorkWindow | null | undefined,
  workMode: "holiday" | "all" | "window" | undefined,
  onDelete: (id: number) => Promise<void>,
  onDeletePair: (id1: number, id2: number) => Promise<void>,
  onEdit: (
    id: number,
    updates: { timestamp?: string; notes?: string }
  ) => Promise<void>
) {
  return list.map((entry, i) => {
    const upper = i > 0 ? list[i - 1] : null
    const hasBadge =
      upper !== null &&
      ((upper.type === "LOGOUT" && entry.type === "LOGIN") ||
        (upper.type === "LOGIN" && entry.type === "LOGOUT"))
    return (
      <div key={entry.id} className={`relative ${i > 0 ? "mt-1.5" : ""}`}>
        {hasBadge && upper && (
          <div className="absolute inset-x-0 -top-4 z-10 flex justify-center">
            <InterEntryBadge
              upper={upper}
              lower={entry}
              onDeletePair={() => onDeletePair(upper.id, entry.id)}
            />
          </div>
        )}
        <EventLogItem
          entry={entry}
          isCorrupted={corruptedIds.has(entry.id)}
          workWindow={workWindow}
          workMode={workMode}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      </div>
    )
  })
}

const COLLAPSED_COUNT = 2

export function EventLog({
  entries,
  workWindow,
  workMode,
  onDelete,
  onDeletePair,
  onEdit,
}: EventLogProps) {
  const [expanded, setExpanded] = useState(true)

  const sortedAsc = [...entries].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.id - b.id
  )
  const corruptedIds = findCorruptedIds(sortedAsc)
  const hasCorruption = corruptedIds.size > 0
  const hasMore = entries.length > COLLAPSED_COUNT

  return (
    <div className="flex flex-col rounded-xl border border-border/50 bg-card/20">
      <div className="p-3">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">No events today</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Events will appear here when your laptop locks or unlocks
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {hasCorruption && (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-400">
                <HugeiconsIcon
                  icon={Alert01Icon}
                  size={12}
                  className="shrink-0"
                />
                <span>
                  Consecutive same-type entries detected. Edit or delete to fix.
                </span>
              </div>
            )}

            {hasMore ? (
              <Collapsible open={expanded} onOpenChange={setExpanded}>
                {!expanded && (
                  <div className="">
                    {renderList(
                      entries.slice(0, COLLAPSED_COUNT),
                      corruptedIds,
                      workWindow,
                      workMode,
                      onDelete,
                      onDeletePair,
                      onEdit
                    )}
                  </div>
                )}

                <CollapsibleContent>
                  <div className="scrollbar-hide mb-1.5 max-h-64 space-y-0 overflow-y-auto">
                    {renderList(
                      entries,
                      corruptedIds,
                      workWindow,
                      workMode,
                      onDelete,
                      onDeletePair,
                      onEdit
                    )}
                  </div>
                </CollapsibleContent>

                <CollapsibleTrigger asChild>
                  <button className="mt-1.5 w-full rounded-lg border border-dashed border-border/40 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border/70 hover:text-foreground">
                    {expanded
                      ? "Show less"
                      : `${entries.length - COLLAPSED_COUNT} older ${entries.length - COLLAPSED_COUNT === 1 ? "entry" : "entries"}`}
                  </button>
                </CollapsibleTrigger>
              </Collapsible>
            ) : (
              <div className="">
                {renderList(
                  entries,
                  corruptedIds,
                  workWindow,
                  workMode,
                  onDelete,
                  onDeletePair,
                  onEdit
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
