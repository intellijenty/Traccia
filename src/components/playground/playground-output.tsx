import { useState } from "react"
import type { DraftPunch } from "@/lib/playground"
import { formatClock } from "@/lib/playground"
import { CopyButton } from "@/components/copy-button"
import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"
import FloorPlan from "./FloorPlan"
import { Separator } from "../ui/separator"

interface PlaygroundOutputProps {
  submittable: DraftPunch[]
  onSetReason: (id: string, reason: string) => void
}

export function PlaygroundOutput({ submittable, onSetReason }: PlaygroundOutputProps) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const toggleDone = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="h-full overflow-y-auto scrollbar-hide">
      <div className="flex flex-col gap-4 p-4">
      <FloorPlan compact className="w-full" />

      <Separator />

      {/* Section 1: submit yourself */}
      <section>
        {submittable.length !== 0 && (
          <>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Submit yourself
            </h3>
            <p className="mb-3 text-[11px] leading-snug text-muted-foreground/70">
              Add each of these in the portal&apos;s Request Time Entry dialog.
              Pick the time, paste the reason.
            </p>
          </>
        )}

        {submittable.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground/60">
            Nothing to add yet. <br/> Copy from local or add a punch manually.
          </p>
        ) : (
          <ul className="space-y-2">
            {submittable.map((p) => {
              const isDone = done.has(p.id)
              return (
                <li
                  key={p.id}
                  className={cn(
                    "rounded-lg border border-border/50 bg-card/30 p-2.5 transition-opacity",
                    isDone && "opacity-50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleDone(p.id)}
                      aria-label="Mark entered"
                      className={cn(
                        "shrink-0 transition-colors",
                        isDone ? "text-emerald-400" : "text-muted-foreground/40 hover:text-muted-foreground"
                      )}
                    >
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} />
                    </button>
                    <span className="font-mono text-sm font-medium tabular-nums">
                      {formatClock(p.time)}
                    </span>
                    <div className="ml-auto">
                      <CopyButton
                        text={p.reason}
                        variant="ghost"
                        size="icon-sm"
                        disabled={!p.reason.trim()}
                        title="Copy reason"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    value={p.reason}
                    onChange={(e) => onSetReason(p.id, e.target.value)}
                    placeholder="Reason for HRMS (required)"
                    className={cn(
                      "mt-2 w-full rounded-md border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring",
                      p.reason.trim() ? "border-border" : "border-amber-500/40"
                    )}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </section>
      </div>
    </div>
  )
}
