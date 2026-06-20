import type { DraftPunch, LocalSession } from "@/lib/playground"
import { activePunches, formatClock, formatMins } from "@/lib/playground"
import { TimePopover } from "./playground-time-popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  AlertCircleIcon,
  ArrowDownDoubleIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons"

interface PlaygroundLadderProps {
  draft: DraftPunch[]
  localSessions: LocalSession[]
  onCopyLocal: (iso: string) => void
  onEditPunch: (id: string, hours: number, minutes: number) => void
  onRemovePunch: (id: string) => void
}

function minOfDay(iso: string): { h: number; m: number } {
  const d = new Date(iso)
  return { h: d.getHours(), m: d.getMinutes() }
}

/** Flatten sessions → individual time-sorted events for the local rail. */
function localEventList(sessions: LocalSession[]) {
  const events: { time: string; trigger: string; role: "in" | "out" }[] = []
  for (const s of sessions) {
    events.push({ time: s.inTime, trigger: s.inTrigger ?? "", role: "in" })
    if (s.outTime) events.push({ time: s.outTime, trigger: s.outTrigger ?? "", role: "out" })
  }
  return events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
}

export function PlaygroundLadder({
  draft,
  localSessions,
  onCopyLocal,
  onEditPunch,
  onRemovePunch,
}: PlaygroundLadderProps) {
  const active = activePunches(draft)
  const unbalanced = active.length % 2 === 1
  const localEvents = localEventList(localSessions)

  return (
    <div className="flex gap-8">
      {/* ── Draft ladder ── */}
      <div className="min-w-0 flex-1">
        <LaneHeader label="Draft" sub="your fix" />

        {active.length === 0 ? (
          <Empty text="No punches. Copy from local → or add one manually." />
        ) : (
          <div>
            {active.map((punch, i) => {
              const role: "in" | "out" = i % 2 === 0 ? "in" : "out"
              const prev = i > 0 ? active[i - 1] : null
              const connMin = prev
                ? Math.floor((new Date(punch.time).getTime() - new Date(prev.time).getTime()) / 60000)
                : null
              const prevIsIn = i > 0 && (i - 1) % 2 === 0

              return (
                <div key={punch.id} className={cn("relative", i > 0 && "mt-1.5")}>
                  {connMin !== null && (
                    <div className="absolute inset-x-0 -top-4 z-10 flex justify-center">
                      <FloatingBadge kind={prevIsIn ? "work" : "gap"} minutes={connMin} />
                    </div>
                  )}
                  <PunchRow
                    punch={punch}
                    role={role}
                    onEdit={onEditPunch}
                    onRemove={onRemovePunch}
                  />
                </div>
              )
            })}
            {unbalanced && (
              <div className="relative mt-1.5">
                <MissingRow />
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Local evidence rail — same cell height as draft ── */}
      <div className="min-w-0 flex-1">
        <LaneHeader label="Local" sub="evidence" />
        {localEvents.length === 0 ? (
          <Empty text="No local evidence for this day." />
        ) : (
          <div>
            {localEvents.map((ev, i) => {
              const prev = i > 0 ? localEvents[i - 1] : null
              const connMin = prev
                ? Math.round((new Date(ev.time).getTime() - new Date(prev.time).getTime()) / 60000)
                : null
              const prevIsIn = prev?.role === "in"

              return (
                <div key={i} className={cn("relative", i > 0 && "mt-1.5")}>
                  {connMin !== null && (
                    <div className="absolute inset-x-0 -top-4 z-10 flex justify-center">
                      <FloatingBadge kind={prevIsIn ? "work" : "gap"} minutes={connMin} />
                    </div>
                  )}
                  <LocalEventRow ev={ev} onCopy={() => onCopyLocal(ev.time)} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──

function LaneHeader({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-[11px] text-muted-foreground/70">{sub}</span>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border/50 px-3 py-6 text-center text-[11px] text-muted-foreground/60">
      {text}
    </p>
  )
}

function RoleBadge({ role }: { role: "in" | "out" }) {
  return (
    <span
      className={cn(
        "inline-flex w-9 shrink-0 items-center justify-center rounded-md px-1 py-0.5 text-[10px] font-semibold tracking-wide",
        role === "in" ? "bg-emerald-400/15 text-emerald-400" : "bg-red-400/15 text-red-400"
      )}
    >
      {role === "in" ? "IN" : "OUT"}
    </span>
  )
}

/** Floating pill badge — absolutely positioned at -top-4 on the lower entry's wrapper. */
function FloatingBadge({ kind, minutes }: { kind: "work" | "gap"; minutes: number }) {
  return (
    <span
      className={cn(
        "rounded-full border bg-card px-3 py-1.5 text-xs font-semibold tabular-nums shadow-sm backdrop-blur-sm",
        kind === "work"
          ? "border-blue-500/25 text-blue-400/75"
          : "border-amber-500/25 text-amber-400/75"
      )}
    >
      {formatMins(minutes)} {kind === "work" ? "session" : "break"}
    </span>
  )
}

function LocalEventRow({
  ev,
  onCopy,
}: {
  ev: { time: string; trigger: string; role: "in" | "out" }
  onCopy: () => void
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      title="Copy this time into the draft"
      className="group flex h-12 w-full items-center gap-3 rounded-lg border border-border/40 bg-card/20 px-3 text-left transition-colors hover:border-emerald-400/40 hover:bg-emerald-400/5"
    >
      <RoleBadge role={ev.role} />
      <span className="font-mono text-base font-medium tabular-nums">{formatClock(ev.time)}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground/60">
        {(ev.trigger || "").replace("via ", "")}
      </span>
      <HugeiconsIcon
        icon={ArrowDownDoubleIcon}
        size={14}
        className="shrink-0 text-muted-foreground/0 transition-colors group-hover:text-emerald-400"
      />
    </button>
  )
}

function PunchRow({
  punch,
  role,
  onEdit,
  onRemove,
}: {
  punch: DraftPunch
  role: "in" | "out"
  onEdit: (id: string, h: number, m: number) => void
  onRemove: (id: string) => void
}) {
  const isAnchor = punch.origin === "anchor"
  const init = minOfDay(punch.time)
  return (
    <div className="flex h-12 items-center gap-3 rounded-lg border border-border/40 bg-card/20 px-3 transition-colors hover:bg-card/40">
      <RoleBadge role={role} />
      <span className="font-mono text-base font-medium tabular-nums">{formatClock(punch.time)}</span>
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[10px] font-medium",
          isAnchor ? "bg-blue-400/15 text-blue-400" : "bg-emerald-400/15 text-emerald-400"
        )}
      >
        {isAnchor ? "portal" : "added"}
      </span>

      {!isAnchor && (
        <div className="ml-auto flex items-center gap-1">
          <TimePopover
              title="Edit time"
              submitLabel="Set time"
              align="end"
              initialH={init.h}
              initialM={init.m}
              onSubmit={(h, m) => onEdit(punch.id, h, m)}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Edit time"
                >
                  <HugeiconsIcon icon={PencilEdit02Icon} size={14} />
                </Button>
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-red-400"
              onClick={() => onRemove(punch.id)}
              aria-label="Delete punch"
            >
              <HugeiconsIcon icon={Delete02Icon} size={15} />
            </Button>
        </div>
      )}
    </div>
  )
}

function MissingRow() {
  return (
    <div className="flex h-12 items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3">
      <span className="inline-flex w-9 shrink-0 items-center justify-center rounded-md bg-red-500/20 px-1 py-0.5 text-[10px] font-semibold text-red-400">
        OUT
      </span>
      <span className="flex items-center gap-1.5 text-sm font-medium text-red-400">
        <HugeiconsIcon icon={AlertCircleIcon} size={15} />
        Missing — add a closing punch
      </span>
    </div>
  )
}

