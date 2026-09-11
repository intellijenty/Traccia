import { useState } from "react"
import { cn } from "@/lib/utils"
import type { EodHistoryEntry } from "@/lib/eod-types"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
} from "@hugeicons/core-free-icons"
import { Badge } from "../ui/badge"

interface EodHistoryPanelProps {
  history: Record<string, EodHistoryEntry>
  onView: (entry: EodHistoryEntry) => void
}

function formatHistoryDate(dateStr: string): string {
  const today = new Date().toLocaleDateString("en-CA")
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA")
  if (dateStr === today) return "Today"
  if (dateStr === yesterday) return "Yesterday"
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function formatSentTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export function EodHistoryPanel({ history, onView }: EodHistoryPanelProps) {
  const [open, setOpen] = useState(true)

  const entries = Object.values(history)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7)

  if (entries.length === 0) return null

  return (
    <div>
      {/* Collapsible header */}
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center justify-between py-1 text-xs font-medium tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
      >
        Recent Drafts
        <HugeiconsIcon
          icon={open ? ArrowDown01Icon : ArrowRight01Icon}
          size={15}
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-450",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Entries */}
      {open && (
        <div className="mt-1 space-y-0.5">
          {entries.map((entry, idx) => (
            <button
              key={entry.date}
              type="button"
              tabIndex={-1}
              onClick={() => onView(entry)}
              className="group flex w-full animate-in cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-300 fade-in slide-in-from-bottom-1 hover:bg-muted/60"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <span className="min-w-12 text-sm text-foreground">
                {formatHistoryDate(entry.date)}
              </span>
              <Badge variant={"outline"} className={cn("mx-2 text-xs")}>
                {entry.mode === "form" ? "Form" : "Editor"}
              </Badge>
              <span className="flex-1 text-xs text-muted-foreground/60 tabular-nums">
                {formatSentTime(entry.sentAt)}
              </span>
              <HugeiconsIcon
                icon={ArrowRight02Icon}
                size={15}
                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
