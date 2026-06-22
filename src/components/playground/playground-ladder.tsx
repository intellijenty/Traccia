import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { DraftPunch, Gate, LocalSession, Wire } from "@/lib/playground"
import { activePunches, formatClock, formatMins, isInTimeRange } from "@/lib/playground"
import { TimePopover, TimeRangePopover } from "./playground-time-popover"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  AlertCircleIcon,
  PencilEdit02Icon,
  Add01Icon,
  ViewOffSlashIcon,
  Cancel01Icon,
  Door02Icon,
  Coffee02Icon,
  Hotel02Icon,
  CodeSquareIcon,
} from "@hugeicons/core-free-icons"
import type { WorkWindow } from "@/lib/types"

interface PlaygroundLadderProps {
  draft: DraftPunch[]
  localSessions: LocalSession[]
  wires: Wire[]
  hiddenLocalTimes: string[]
  localTimeRange: { start: string; end: string } | null
  workWindow: WorkWindow | null
  onAddWire: (draftTime: string, localTime: string) => void
  onRemoveWire: (draftTime: string) => void
  onCopyLocal: (iso: string) => void
  onHideLocalEvent: (time: string) => void
  onSetTimeRange: (range: { start: string; end: string } | null) => void
  onEditPunch: (id: string, hours: number, minutes: number) => void
  onRemovePunch: (id: string) => void
  onCycleGate: (id: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function minOfDay(iso: string): { h: number; m: number } {
  const d = new Date(iso)
  return { h: d.getHours(), m: d.getMinutes() }
}

function fmtHHMM(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  const ampm = h < 12 ? "AM" : "PM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}

function localEventList(sessions: LocalSession[]) {
  const events: { time: string; trigger: string; role: "in" | "out" }[] = []
  for (const s of sessions) {
    events.push({ time: s.inTime, trigger: s.inTrigger ?? "", role: "in" })
    if (s.outTime) events.push({ time: s.outTime, trigger: s.outTrigger ?? "", role: "out" })
  }
  return events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
}

const TIP_DELAY = 500

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip delayDuration={TIP_DELAY}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>{label}</TooltipContent>
    </Tooltip>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PlaygroundLadder({
  draft,
  localSessions,
  wires,
  hiddenLocalTimes,
  localTimeRange,
  workWindow,
  onAddWire,
  onRemoveWire,
  onCopyLocal,
  onHideLocalEvent,
  onSetTimeRange,
  onEditPunch,
  onRemovePunch,
  onCycleGate,
}: PlaygroundLadderProps) {
  const active = activePunches(draft)
  const unbalanced = active.length % 2 === 1

  // Local event lists — all vs visible (filtered).
  const allLocalEvents = useMemo(() => localEventList(localSessions), [localSessions])
  const visibleLocalEvents = useMemo(
    () =>
      allLocalEvents.filter((ev) => {
        if (hiddenLocalTimes.includes(ev.time)) return false
        if (localTimeRange && !isInTimeRange(ev.time, localTimeRange.start, localTimeRange.end)) return false
        return true
      }),
    [allLocalEvents, hiddenLocalTimes, localTimeRange]
  )
  const visibleLocalTimes = useMemo(
    () => new Set(visibleLocalEvents.map((e) => e.time)),
    [visibleLocalEvents]
  )
  const hiddenCount = allLocalEvents.length - visibleLocalEvents.length

  // ── Wiring state ─────────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null)
  const portRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [pending, setPending] = useState<{ side: "draft" | "local"; time: string } | null>(null)
  const trailingPathRef = useRef<SVGPathElement>(null)
  const [wirePaths, setWirePaths] = useState<{ key: string; d: string }[]>([])

  function getPortCenter(key: string) {
    const el = portRefs.current.get(key)
    const container = containerRef.current
    if (!el || !container) return null
    const er = el.getBoundingClientRect()
    const cr = container.getBoundingClientRect()
    return { x: er.left + er.width / 2 - cr.left, y: er.top + er.height / 2 - cr.top }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const paths: { key: string; d: string }[] = []
    for (const wire of wires) {
      if (!visibleLocalTimes.has(wire.localTime)) continue
      const p1 = getPortCenter(`d:${wire.draftTime}`)
      const p2 = getPortCenter(`l:${wire.localTime}`)
      if (!p1 || !p2) continue
      const t = (p2.x - p1.x) * 0.5
      paths.push({
        key: `${wire.draftTime}|${wire.localTime}`,
        d: `M ${p1.x} ${p1.y} C ${p1.x + t} ${p1.y} ${p2.x - t} ${p2.y} ${p2.x} ${p2.y}`,
      })
    }
    setWirePaths(paths)
  }, [wires, active.length, visibleLocalEvents])

  useEffect(() => {
    if (!pending && trailingPathRef.current) {
      trailingPathRef.current.setAttribute("d", "")
    }
  }, [pending])

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPending(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pending])

  function handlePortClick(side: "draft" | "local", time: string) {
    if (!pending) {
      const existing = wires.find((w) =>
        side === "draft" ? w.draftTime === time : w.localTime === time
      )
      if (existing) { onRemoveWire(existing.draftTime); return }
      setPending({ side, time })
      return
    }
    if (pending.side === side) { setPending(null); return }
    const draftTime = pending.side === "draft" ? pending.time : time
    const localTime  = pending.side === "local"  ? pending.time : time
    onAddWire(draftTime, localTime)
    setPending(null)
  }

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!pending || !trailingPathRef.current || !containerRef.current) return
      const cr = containerRef.current.getBoundingClientRect()
      const cx = e.clientX - cr.left
      const cy = e.clientY - cr.top
      const portKey = `${pending.side === "draft" ? "d" : "l"}:${pending.time}`
      const p1 = getPortCenter(portKey)
      if (!p1) return
      const t = Math.abs(cx - p1.x) * 0.5
      const d =
        pending.side === "draft"
          ? `M ${p1.x} ${p1.y} C ${p1.x + t} ${p1.y} ${cx - t} ${cy} ${cx} ${cy}`
          : `M ${p1.x} ${p1.y} C ${p1.x - t} ${p1.y} ${cx + t} ${cy} ${cx} ${cy}`
      trailingPathRef.current.setAttribute("d", d)
    },
    [pending] // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <div
      ref={containerRef}
      className="relative flex gap-8"
      onMouseMove={handleMouseMove}
      onClick={(e) => {
        if (!pending) return
        if (!(e.target as HTMLElement).closest("[data-port]")) setPending(null)
      }}
    >
      {/* SVG overlay */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {wirePaths.map(({ key, d }) => (
          <path key={key} d={d} fill="none" stroke="rgb(168 85 247)" strokeWidth={1.5} strokeOpacity={0.65} strokeLinecap="round" />
        ))}
        <path ref={trailingPathRef} fill="none" stroke="rgb(168 85 247)" strokeWidth={1.5} strokeOpacity={0.45} strokeDasharray="4 3" strokeLinecap="round" d="" />
      </svg>

      {/* ── Draft lane ── */}
      <div className="min-w-0 flex-1">
        <LaneHeader label="Draft Entries" sub="to be fixed" />
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
              const isWired = wires.some((w) => w.draftTime === punch.time)
              const isPending = pending?.side === "draft" && pending.time === punch.time

              return (
                <div key={punch.id} className={cn("relative", i > 0 && "mt-1.5")}>
                  {connMin !== null && (
                    <div className="pointer-events-none absolute inset-x-0 -top-4 z-10 flex justify-center">
                      <FloatingBadge kind={prevIsIn ? "work" : "gap"} minutes={connMin} />
                    </div>
                  )}
                  <PunchRow
                    punch={punch}
                    role={role}
                    isWired={isWired}
                    isPending={isPending}
                    portRef={(el) => {
                      const key = `d:${punch.time}`
                      if (el) portRefs.current.set(key, el)
                      else portRefs.current.delete(key)
                    }}
                    onPortClick={() => handlePortClick("draft", punch.time)}
                    onEdit={onEditPunch}
                    onRemove={onRemovePunch}
                    onCycleGate={onCycleGate}
                  />
                </div>
              )
            })}
            {unbalanced && <div className="relative mt-1.5"><MissingRow /></div>}
          </div>
        )}
      </div>

      {/* ── Local evidence lane ── */}
      <div className="min-w-0 flex-1">
        <LocalLaneHeader
          localTimeRange={localTimeRange}
          workWindow={workWindow}
          hiddenCount={hiddenCount}
          totalCount={allLocalEvents.length}
          onSetTimeRange={onSetTimeRange}
        />
        {allLocalEvents.length === 0 ? (
          <Empty text="No local evidence for this day." />
        ) : visibleLocalEvents.length === 0 ? (
          <AllHiddenEmpty onRestore={() => onSetTimeRange(workWindow ? { start: workWindow.start, end: workWindow.end } : null)} />
        ) : (
          <div>
            {visibleLocalEvents.map((ev, i) => {
              const prev = i > 0 ? visibleLocalEvents[i - 1] : null
              const connMin = prev
                ? Math.round((new Date(ev.time).getTime() - new Date(prev.time).getTime()) / 60000)
                : null
              const prevIsIn = prev?.role === "in"
              const isWired = wires.some((w) => w.localTime === ev.time)
              const isPending = pending?.side === "local" && pending.time === ev.time

              return (
                <div key={ev.time} className={cn("relative", i > 0 && "mt-1.5")}>
                  {connMin !== null && (
                    <div className="pointer-events-none absolute inset-x-0 -top-4 z-10 flex justify-center">
                      <FloatingBadge kind={prevIsIn ? "work" : "gap"} minutes={connMin} />
                    </div>
                  )}
                  <LocalEventRow
                    ev={ev}
                    isWired={isWired}
                    isPending={isPending}
                    portRef={(el) => {
                      const key = `l:${ev.time}`
                      if (el) portRefs.current.set(key, el)
                      else portRefs.current.delete(key)
                    }}
                    onPortClick={() => handlePortClick("local", ev.time)}
                    onCopy={() => onCopyLocal(ev.time)}
                    onHide={() => onHideLocalEvent(ev.time)}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LaneHeader({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="mb-2 flex h-7 items-center gap-2">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-[11px] text-muted-foreground/70">{sub}</span>
    </div>
  )
}

function LocalLaneHeader({
  localTimeRange,
  workWindow,
  hiddenCount,
  totalCount,
  onSetTimeRange,
}: {
  localTimeRange: { start: string; end: string } | null
  workWindow: WorkWindow | null
  hiddenCount: number
  totalCount: number
  onSetTimeRange: (range: { start: string; end: string } | null) => void
}) {
  const fallbackStart = workWindow?.start ?? "09:00"
  const fallbackEnd   = workWindow?.end   ?? "18:00"

  return (
    <div className="mb-2 flex h-7 items-center gap-2">
      <span className="text-sm font-medium">Local Machine Entries</span>
      <span className="text-[11px] text-muted-foreground/70">evidence</span>

      <div className="ml-auto flex items-center gap-2">
        {hiddenCount > 0 && (
          <span className="text-[10px] tabular-nums text-muted-foreground/50">
            {totalCount - hiddenCount}/{totalCount}
          </span>
        )}

        {/* Time range filter pill */}
        <div className={cn(
          "inline-flex items-center rounded-md border text-[11px] transition-colors",
          localTimeRange
            ? "border-blue-500/30 bg-blue-500/10"
            : "border-border/50 bg-muted/30"
        )}>
          <TimeRangePopover
            initialStart={localTimeRange?.start ?? fallbackStart}
            initialEnd={localTimeRange?.end   ?? fallbackEnd}
            align="end"
            onSubmit={(start, end) => onSetTimeRange({ start, end })}
            trigger={
              <button
                type="button"
                className={cn(
                  "px-2 py-1 transition-colors",
                  localTimeRange ? "text-blue-400 hover:text-blue-300" : "text-muted-foreground/60 hover:text-muted-foreground"
                )}
              >
                {localTimeRange
                  ? `${fmtHHMM(localTimeRange.start)} – ${fmtHHMM(localTimeRange.end)}`
                  : "All hours"}
              </button>
            }
          />
          {localTimeRange && (
            <button
              type="button"
              onClick={() => onSetTimeRange(null)}
              className="border-l border-blue-500/20 px-1.5 py-1 text-blue-400/50 transition-colors hover:text-blue-400"
              aria-label="Clear time filter"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={9} />
            </button>
          )}
        </div>
      </div>
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

function AllHiddenEmpty({ onRestore }: { onRestore: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border/50 px-3 py-5 text-center">
      <p className="text-[11px] text-muted-foreground/60">All events hidden by filters.</p>
      <button
        type="button"
        onClick={onRestore}
        className="mt-1 text-[11px] text-muted-foreground/50 underline underline-offset-2 hover:text-muted-foreground"
      >
        Restore local events
      </button>
    </div>
  )
}

function RoleBadge({ role }: { role: "in" | "out" }) {
  return (
    <span className={cn(
      "inline-flex w-9 shrink-0 items-center justify-center rounded-md px-1 py-0.5 text-[10px] font-semibold tracking-wide",
      role === "in" ? "bg-emerald-400/15 text-emerald-400" : "bg-red-400/15 text-red-400"
    )}>
      {role === "in" ? "IN" : "OUT"}
    </span>
  )
}

function FloatingBadge({ kind, minutes }: { kind: "work" | "gap"; minutes: number }) {
  return (
    <span className={cn(
      "rounded-full border bg-card px-3 py-1.5 text-xs font-semibold tabular-nums shadow-sm backdrop-blur-sm",
      kind === "work"
        ? "border-blue-500/25 text-blue-400/75"
        : "border-amber-500/25 text-amber-400/75"
    )}>
      {formatMins(minutes)} {kind === "work" ? "session" : "break"}
    </span>
  )
}

function Port({
  portRef, side, isWired, isPending, onPortClick,
}: {
  portRef: (el: HTMLElement | null) => void
  side: "draft" | "local"
  isWired: boolean
  isPending: boolean
  onPortClick: () => void
}) {
  const tipLabel = isPending ? "Cancel (Esc)" : isWired ? "Disconnect" : "Link to Evidence"
  return (
    <Tip label={tipLabel}>
      <button
        ref={portRef}
        data-port="true"
        type="button"
        onClick={(e) => { e.stopPropagation(); onPortClick() }}
        className={cn(
          "absolute top-1/2 z-20 size-2.5 -translate-y-1/2 cursor-pointer rounded-full border-2 transition-all duration-150",
          side === "draft" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2",
          isPending
            ? "animate-pulse scale-125 border-purple-400 bg-purple-400/40"
            : isWired
            ? "scale-110 border-purple-500 bg-purple-500"
            : "border-muted-foreground/25 bg-transparent hover:border-purple-400/60 hover:bg-purple-400/10"
        )}
        aria-label={tipLabel}
      />
    </Tip>
  )
}

function PunchRow({
  punch, role, isWired, isPending, portRef, onPortClick, onEdit, onRemove, onCycleGate,
}: {
  punch: DraftPunch
  role: "in" | "out"
  isWired: boolean
  isPending: boolean
  portRef: (el: HTMLElement | null) => void
  onPortClick: () => void
  onEdit: (id: string, h: number, m: number) => void
  onRemove: (id: string) => void
  onCycleGate: (id: string) => void
}) {
  const isAnchor = punch.origin === "anchor"
  const init = minOfDay(punch.time)
  return (
    <div className={cn(
      "group relative flex h-12 items-center gap-3 rounded-lg border px-3 transition-colors hover:bg-card/40",
      isWired ? "border-purple-500/30" : !isAnchor ? "border-emerald-400/30" : "border-border/60",
      isAnchor ? "bg-card/20" : "bg-emerald-400/[0.06]"
    )}>
      <RoleBadge role={role} />
      <span className="font-mono text-base font-medium tabular-nums">{formatClock(punch.time)}</span>
      <span className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium",
        isAnchor ? "bg-blue-400/15 text-blue-400" : "bg-emerald-400/15 text-emerald-400"
      )}>
        {isAnchor ? "portal" : "added"}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <GateButton gate={punch.gate ?? null} onClick={() => onCycleGate(punch.id)} />
        {!isAnchor && (
          <>
            <Tooltip delayDuration={TIP_DELAY}>
              <TimePopover
                title="Edit time"
                submitLabel="Set time"
                align="end"
                initialH={init.h}
                initialM={init.m}
                onSubmit={(h, m) => onEdit(punch.id, h, m)}
                trigger={
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground" aria-label="Edit time">
                      <HugeiconsIcon icon={PencilEdit02Icon} size={14} />
                    </Button>
                  </TooltipTrigger>
                }
              />
              <TooltipContent side="top" sideOffset={4}>Edit time</TooltipContent>
            </Tooltip>
            <Tip label="Delete punch">
              <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-red-400" onClick={() => onRemove(punch.id)} aria-label="Delete punch">
                <HugeiconsIcon icon={Delete02Icon} size={15} />
              </Button>
            </Tip>
          </>
        )}
      </div>

      <Port portRef={portRef} side="draft" isWired={isWired} isPending={isPending} onPortClick={onPortClick} />
    </div>
  )
}

function GateButton({ gate, onClick }: { gate: Gate; onClick: () => void }) {
  const { icon, label } =
    gate === "room1"     ? { icon: Hotel02Icon,    label: "Room 1" }
    : gate === "room2"   ? { icon: CodeSquareIcon, label: "Room 2" }
    : gate === "cafeteria" ? { icon: Coffee02Icon, label: "Cafeteria" }
    : { icon: Door02Icon, label: "Set gate" }

  const className = gate === null
    ? "text-transparent group-hover:text-foreground/40 hover:!text-foreground/70"
    : "text-foreground/70 hover:text-foreground"

  return (
    <Tip label={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onClick}
        aria-label={label}
        className={cn("transition-colors", className)}
      >
        <HugeiconsIcon icon={icon} size={14} />
      </Button>
    </Tip>
  )
}

function LocalEventRow({
  ev, isWired, isPending, portRef, onPortClick, onCopy, onHide,
}: {
  ev: { time: string; trigger: string; role: "in" | "out" }
  isWired: boolean
  isPending: boolean
  portRef: (el: HTMLElement | null) => void
  onPortClick: () => void
  onCopy: () => void
  onHide: () => void
}) {
  return (
    <div className={cn(
      "group relative flex h-12 items-center gap-3 rounded-lg border bg-card/20 px-3 transition-colors hover:bg-card/40",
      isWired ? "border-purple-500/30" : "border-border/60"
    )}>
      <RoleBadge role={ev.role} />
      <span className="font-mono text-base font-medium tabular-nums">{formatClock(ev.time)}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground/60">
        {(ev.trigger || "").replace("via ", "")}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Tip label="Hide event">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onHide} className="text-transparent transition-colors group-hover:text-foreground/40 hover:!text-foreground/70" aria-label="Hide event">
            <HugeiconsIcon icon={ViewOffSlashIcon} size={13} />
          </Button>
        </Tip>
        <Tip label="Add to draft">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onCopy} className="text-muted-foreground hover:text-foreground" aria-label="Add to draft">
            <HugeiconsIcon icon={Add01Icon} size={15} />
          </Button>
        </Tip>
      </div>
      <Port portRef={portRef} side="local" isWired={isWired} isPending={isPending} onPortClick={onPortClick} />
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
