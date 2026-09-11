import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  LockIcon,
  PencilEdit01Icon,
  Alert01Icon,
  Delete02Icon,
  Tick01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"
import type { PunchEntry, WorkWindow } from "@/lib/types"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })
}

function timestampToTimeInput(timestamp: string): string {
  const d = new Date(timestamp)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
}

function buildUpdatedTimestamp(original: string, newTime: string): string {
  // newTime is HH:MM or HH:MM:SS
  const d = new Date(original)
  const parts = newTime.split(":").map(Number)
  d.setHours(parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, 0)
  return d.toISOString()
}

function getSourceIcon(source: string) {
  switch (source) {
    case "manual":
      return PencilEdit01Icon
    case "estimated":
      return Alert01Icon
    default:
      return LockIcon
  }
}

const TRIGGER_LABELS: Record<string, string> = {
  "via boot": "system startup",
  "via unlock": "screen unlock",
  "via resume": "sleep resume",
  "via lock": "screen lock",
  "via shutdown": "system shutdown",
  "via sleep": "sleep/suspend",
  "via estimated": "crash recovery",
  "via quit": "app quit",
  "via manual": "manual entry",
  "via midnight": "midnight split",
  "auto-compensate": "sequence repair",
}

function getSourceTooltip(source: string, trigger: string): string {
  if (source === "manual") return "Manual entry"
  if (source === "estimated") return "Estimated (crash recovery)"
  const label = TRIGGER_LABELS[trigger]
  return label ? `Auto — ${label}` : "Automatic"
}

// ── Component ─────────────────────────────────────────────────────────────────

function isEntryInWorkWindow(
  entry: PunchEntry,
  workWindow: WorkWindow | null | undefined,
  workMode: "holiday" | "all" | "window"
): boolean {
  if (workMode === "holiday") return false
  if (workMode === "all" || !workWindow) return true
  const d = new Date(entry.timestamp)
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  if (workWindow.start <= workWindow.end) {
    return hhmm >= workWindow.start && hhmm < workWindow.end
  }
  // Wrapped: e.g. 22:00–06:00 → valid if >= start OR < end
  return hhmm >= workWindow.start || hhmm < workWindow.end
}

interface EventLogItemProps {
  entry: PunchEntry
  isCorrupted?: boolean
  workWindow?: WorkWindow | null
  workMode?: "holiday" | "all" | "window"
  onDelete: (id: number) => Promise<void>
  onEdit: (
    id: number,
    updates: { timestamp?: string; notes?: string }
  ) => Promise<void>
}

export function EventLogItem({
  entry,
  isCorrupted = false,
  workWindow,
  workMode = "all",
  onDelete,
  onEdit,
}: EventLogItemProps) {
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTime, setEditTime] = useState("")
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isIn = entry.type === "LOGIN"
  const isEdited = !!entry.modified_at
  const SourceIcon = getSourceIcon(entry.source)
  const outsideWindow = !isEntryInWorkWindow(entry, workWindow, workMode)

  function startEdit() {
    setEditTime(timestampToTimeInput(entry.timestamp))
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setEditTime("")
  }

  async function saveEdit() {
    if (!editTime) return cancelEdit()
    const newTs = buildUpdatedTimestamp(entry.timestamp, editTime)
    if (newTs === entry.timestamp) return cancelEdit()
    setSaving(true)
    try {
      await onEdit(entry.id, { timestamp: newTs })
      setEditing(false)
      setEditTime("")
    } finally {
      setSaving(false)
    }
  }

  // Focus the input when editing starts
  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function handleDelete() {
    setDeleting(true)
    try {
      await onDelete(entry.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 transition-colors hover:bg-card/60",
        outsideWindow && "opacity-35",
        isCorrupted && "border-amber-500/40 bg-amber-500/5"
      )}
    >
      {/* Source icon */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
              entry.source === "estimated"
                ? "bg-amber-500/15 text-amber-500"
                : "bg-muted text-muted-foreground"
            )}
          >
            <HugeiconsIcon icon={SourceIcon} size={14} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>{getSourceTooltip(entry.source, entry.trigger)}</p>
        </TooltipContent>
      </Tooltip>

      {/* Type badge + trigger */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-bold",
            isIn
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-red-500/15 text-red-400"
          )}
        >
          {isIn ? "IN" : "OUT"}
        </span>
        {isCorrupted && (
          <span className="shrink-0 rounded px-1 py-px text-[9px] font-medium text-amber-400 ring-1 ring-amber-500/40">
            conflict
          </span>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-xs text-muted-foreground">
            {entry.trigger}
          </span>
          {isEdited && (
            <span className="shrink-0 rounded px-1 py-px text-[9px] font-medium text-muted-foreground/50 ring-1 ring-border/40">
              edited
            </span>
          )}
        </div>
      </div>

      {/* Timestamp + actions */}
      <div className="flex shrink-0 items-center gap-1">
        {editing ? (
          /* ── Inline time editor ── */
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="time"
              step="1"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit()
                if (e.key === "Escape") cancelEdit()
              }}
              className="h-7 w-28 rounded border border-primary/40 bg-background px-1.5 font-mono text-[11px] tabular-nums ring-1 ring-primary/20 outline-none focus:ring-primary/40"
              disabled={saving}
            />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={saveEdit}
              disabled={saving}
              className="text-emerald-400 hover:text-emerald-300"
            >
              <HugeiconsIcon icon={Tick01Icon} size={12} />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={cancelEdit}
              disabled={saving}
              className="text-muted-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </Button>
          </div>
        ) : (
          /* ── Display time (click to edit) ── */
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={startEdit}
                  className="rounded px-1 py-0.5 font-mono text-xs text-muted-foreground tabular-nums transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  {formatTime(entry.timestamp)}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Click to edit time
              </TooltipContent>
            </Tooltip>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  disabled={deleting}
                >
                  <HugeiconsIcon icon={Delete02Icon} size={12} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete entry</AlertDialogTitle>
                  <AlertDialogDescription>
                    Remove this {isIn ? "IN" : "OUT"} entry at{" "}
                    {formatTime(entry.timestamp)}? This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  )
}
