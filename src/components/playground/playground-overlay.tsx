import { useCallback, useEffect, useRef, useState } from "react"
import { Keyboard } from "lucide-react"
import { usePlayground } from "@/hooks/use-playground"
import { PlaygroundLadder } from "./playground-ladder"
import { PlaygroundOutput } from "./playground-output"
import { PlaygroundShortcutsDialog } from "./playground-shortcuts-dialog"
import { TimePopover } from "./playground-time-popover"
import { formatMins } from "@/lib/playground"
import { formatDateDisplay } from "@/lib/week-utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  Cancel01Icon,
  SparklesIcon,
  RefreshIcon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  PlusSignCircleIcon,
} from "@hugeicons/core-free-icons"

interface PlaygroundOverlayProps {
  date: string
  onClose: () => void
}

export function PlaygroundOverlay({ date, onClose }: PlaygroundOverlayProps) {
  const pg = usePlayground(date)
  const hasPendingWireRef = useRef(false)
  const addPunchTriggerRef = useRef<HTMLButtonElement>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const handlePendingChange = useCallback((active: boolean) => {
    hasPendingWireRef.current = active
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable

      if (e.key === "Escape") {
        if (!hasPendingWireRef.current) onClose()
        return
      }

      if (inInput) return

      if ((e.key === "a" || e.key === "A") && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        addPunchTriggerRef.current?.click()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, pg])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Fix miss-punch"
      className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-background duration-200 animate-in fade-in"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-medium">
            <HugeiconsIcon icon={SparklesIcon} size={16} className="text-amber-400" />
            Fix miss-punch
          </h2>
          <p className="text-sm text-muted-foreground">{formatDateDisplay(date)}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </Button>
        </div>
      </div>

      <PlaygroundShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Notice banner */}
      {pg.notice && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-xs text-amber-300">
          <HugeiconsIcon icon={AlertCircleIcon} size={14} />
          {pg.notice.appliedTimes.length > 0 ? (
            <span>
              Portal now includes {pg.notice.appliedTimes.join(", ")} — your request was applied.
            </span>
          ) : (
            <span>Portal data changed since you last edited this day.</span>
          )}
          <button type="button" onClick={pg.dismissNotice} className="ml-auto underline">
            Dismiss
          </button>
        </div>
      )}

      {pg.offline && (
        <div className="shrink-0 border-b border-border/50 bg-muted/40 px-6 py-1.5 text-[11px] text-muted-foreground">
          Showing cached portal data (couldn&apos;t reach the portal).
        </div>
      )}

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Left: ladder panel */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {pg.loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : (
            <>
              {/* Status + action bar — pinned, ladder scrolls below */}
              <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-6 py-3">
                {/* Status flow */}
                <span className="flex items-center gap-1.5 text-sm font-medium text-red-400">
                  <HugeiconsIcon icon={AlertCircleIcon} size={14} />
                  Missed punch
                </span>

                <span className="text-muted-foreground/40">→</span>

                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                    pg.balanced
                      ? "bg-emerald-400/15 text-emerald-400"
                      : "bg-amber-500/15 text-amber-400"
                  )}
                >
                  {pg.balanced ? (
                    <>
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} />
                      {formatMins(pg.correctedMinutes)}
                    </>
                  ) : (
                    <>{pg.danglingCount} unpaired</>
                  )}
                </span>

                {/* Actions */}
                <div className="ml-auto flex items-center gap-1.5">
                  <TimePopover
                    title="Add a punch"
                    submitLabel="Add"
                    align="end"
                    onSubmit={pg.addPunch}
                    trigger={
                      <Button ref={addPunchTriggerRef} type="button" variant="outline" size="sm">
                        <HugeiconsIcon icon={PlusSignCircleIcon} size={13} className="mr-" />
                        Add punch
                      </Button>
                    }
                  />
                  <div className="flex items-center rounded-md border border-border/60">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={pg.reset}
                      className="gap-1.5 rounded-r-none border-r border-r-border/60 px-2.5 text-xs hover:text-foreground"
                    >
                      <HugeiconsIcon icon={RefreshIcon} size={13} />
                      Reset
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="rounded-l-none text-muted-foreground hover:text-foreground"
                        >
                          <HugeiconsIcon icon={ArrowDown01Icon} size={11} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-40">
                        <DropdownMenuItem onClick={pg.resetPortal}>
                          Reset portal
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={pg.resetLocal}>
                          Restore local
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setShortcutsOpen(true)}
                    aria-label="Keyboard shortcuts"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {/* Scrollable ladder */}
              <div className="flex-1 overflow-y-auto scrollbar-hide p-6">
                <PlaygroundLadder
                  draft={pg.draft}
                  localSessions={pg.localSessionsList}
                  wires={pg.wires}
                  hiddenLocalTimes={pg.hiddenLocalTimes}
                  localTimeRange={pg.localTimeRange}
                  workWindow={pg.workWindow}
                  onAddWire={pg.addWire}
                  onRemoveWire={pg.removeWire}
                  onCopyLocal={pg.copyFromLocal}
                  onHideLocalEvent={pg.hideLocalEvent}
                  onSetTimeRange={pg.setTimeRange}
                  onEditPunch={pg.editPunch}
                  onRemovePunch={pg.removePunch}
                  onCycleGate={pg.cycleGate}
                  onSetGate={pg.setGate}
                  onPendingChange={handlePendingChange}
                  onShowShortcuts={() => setShortcutsOpen(true)}
                />
              </div>
            </>
          )}
        </div>

        {/* Right: output checklist */}
        <div className="h-full w-80 shrink-0 overflow-hidden border-l border-border bg-muted/20">
          <PlaygroundOutput
            submittable={pg.submittable}
            onSetReason={pg.setReason}
          />
        </div>
      </div>
    </div>
  )
}

