/**
 * DayContextMenu — reusable right-click context menu for any day tile.
 *
 * Wraps its children with ContextMenuTrigger so left-click behaviour
 * (selection, navigation) is completely unaffected — only right-click opens
 * this menu.
 */

import { useState } from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuItem,
} from "@/components/ui/context-menu"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { usePortalStoreContext } from "@/contexts/portal-store"
import { getLocalDate, type DayMark } from "@/lib/week-utils"
import type { DayWorkWindow, NightShiftConfig, DayTarget, DayTargetType } from "@/lib/types"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Database02Icon,
  RefreshIcon,
  Delete02Icon,
  Time04Icon,
  ClockCheckIcon,
} from "@hugeicons/core-free-icons"

// ── Mark type registry ────────────────────────────────────────────────────────

interface MarkDef {
  value: DayMark
  label: string
  dotClass: string
}

const MARK_DEFS: MarkDef[] = [
  { value: "mp", label: "Miss Punch", dotClass: "bg-red-500/70" },
  { value: "fl", label: "Full Leave", dotClass: "bg-violet-500/70" },
  { value: "hl", label: "Half Leave", dotClass: "bg-sky-500/70" },
]

// ── Target presets ────────────────────────────────────────────────────────────

const ADD_REDUCE_PRESETS = [
  { label: "− 2hrs",    value: "-120" },
  { label: "+ 30min",   value: "30"   },
  { label: "+ 1hr",    value: "60"   },
  { label: "+ 1hr 30min", value: "90"   },
  { label: "+ 2hrs",    value: "120"  },
]

const WORK_UNTIL_PRESETS = [
  { label: "05:00 PM", value: "17:00" },
  { label: "06:00 PM", value: "18:00" },
  { label: "07:00 PM", value: "19:00" },
  { label: "08:00 PM", value: "20:00" },
  { label: "08:30 PM", value: "20:30" },
]

const FLEX_BECOMES_PRESETS = [
  { label: "− 1hr",     value: "-60" },
  { label: "Zero",    value: "0"   },
  { label: "+ 30min",    value: "30"  },
  { label: "+ 1hr",     value: "60"  },
  { label: "+ 2hr",     value: "120" },
]

const SET_HOURS_PRESETS = [
  { label: "6 hours",     value: "360" },
  { label: "7 hours",     value: "420" },
  { label: "8 hrs 30 min", value: "510" },
  { label: "9 hours",     value: "540" },
]

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function fmtOffset(v: number): string {
  if (v === 0) return "±0"
  const sign = v > 0 ? "+" : "−"
  return `${sign}${fmtDuration(Math.abs(v))}`
}

// ── Target labels & summary ───────────────────────────────────────────────────

const TARGET_LABELS: Record<DayTargetType, string> = {
  "relative-offset":   "Add/Reduce",
  "end-time":          "Work until",
  "flex-balance":      "Flex becomes",
  "fixed":             "Set Hours",
  "weekly-distribute": "Spread across week",
}

const TARGET_DESCRIPTIONS: Record<DayTargetType, string> = {
  "relative-offset":   "Offset from the standard 8h target.",
  "end-time":          "Stop counting time at this hour.",
  "flex-balance":      "Target a specific flex balance by end of day.",
  "fixed":             "Work exactly this many hours today.",
  "weekly-distribute": "Spread remaining weekly hours evenly.",
}

function formatTargetSummary(target: DayTarget): string {
  switch (target.type) {
    case "relative-offset":
      return fmtOffset(parseInt(target.value ?? "0", 10))
    case "fixed":
      return fmtDuration(parseInt(target.value ?? "0", 10))
    case "end-time":
      return target.value ?? "—"
    case "flex-balance": {
      const v = parseInt(target.value ?? "0", 10)
      return v === 0 ? "±0" : fmtOffset(v)
    }
    case "weekly-distribute":
      return "auto"
  }
}

// ── Misc helpers ──────────────────────────────────────────────────────────────

function formatDayHeader(date: string): string {
  const d = new Date(date + "T00:00:00")
  const thisYear = new Date().getFullYear()
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== thisYear ? { year: "numeric" } : {}),
  })
}

function resolveRadioValue(workWindow?: DayWorkWindow | null): string {
  if (!workWindow) return "default"
  return workWindow.source
}

// ── Sign toggle shared component ─────────────────────────────────────────────

function SignToggle({
  value,
  onChange,
}: {
  value: "+" | "-"
  onChange: (v: "+" | "-") => void
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border">
      {(["+", "-"] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`px-3 py-1.5 text-sm font-mono transition-colors ${
            value === s
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  )
}

// ── Duration inputs shared component ─────────────────────────────────────────

function HMInputs({
  hours,
  mins,
  onHours,
  onMins,
}: {
  hours: string
  mins: string
  onHours: (v: string) => void
  onMins: (v: string) => void
}) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min="0"
          max="24"
          value={hours}
          onChange={(e) => onHours(e.target.value)}
          className="h-9 w-16 text-center font-mono text-sm"
        />
        <span className="text-sm text-muted-foreground">h</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min="0"
          max="59"
          step="5"
          value={mins}
          onChange={(e) => onMins(e.target.value)}
          className="h-9 w-16 text-center font-mono text-sm"
        />
        <span className="text-sm text-muted-foreground">m</span>
      </div>
    </>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DayContextMenuProps {
  date: string
  mark: DayMark | undefined
  onSetMark: (date: string, mark: DayMark | null) => void
  workWindow?: DayWorkWindow | null
  onSetWorkWindow?: (
    date: string,
    startTime: string,
    endTime: string,
    source?: "nightshift" | "manual" | "disabled"
  ) => void
  onDeleteWorkWindow?: (date: string) => void
  nightShift?: NightShiftConfig
  dayTarget?: DayTarget | null
  onSetTarget?: (date: string, type: DayTargetType, value: string | null) => Promise<void>
  onDeleteTarget?: (date: string) => Promise<void>
  children: React.ReactNode
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DayContextMenu({
  date,
  mark,
  onSetMark,
  workWindow,
  onSetWorkWindow,
  onDeleteWorkWindow,
  nightShift,
  dayTarget,
  onSetTarget,
  onDeleteTarget,
  children,
}: DayContextMenuProps) {
  const store = usePortalStoreContext()

  const today = getLocalDate()
  const isFuture = date > today
  const isCached = !!store.cache[date]
  const isPermanent = store.cache[date]?.permanent ?? false
  const isConnected = store.connected

  // ── Work window dialog state ──────────────────────────────────────────────
  const [customOpen, setCustomOpen] = useState(false)
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")

  // ── Target dialog state ───────────────────────────────────────────────────
  const [targetOpen, setTargetOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [targetType, setTargetType] = useState<DayTargetType>("fixed")
  // fixed
  const [fixedHours, setFixedHours] = useState("8")
  const [fixedMins, setFixedMins] = useState("0")
  // end-time
  const [endTime, setEndTime] = useState("17:30")
  // flex-balance
  const [flexSign, setFlexSign] = useState<"+" | "-">("+")
  const [flexHours, setFlexHours] = useState("0")
  const [flexMins, setFlexMins] = useState("0")
  // relative-offset
  const [offsetSign, setOffsetSign] = useState<"+" | "-">("-")
  const [offsetHours, setOffsetHours] = useState("1")
  const [offsetMins, setOffsetMins] = useState("0")

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleMarkChange(value: string) {
    onSetMark(date, value === "" ? null : (value as DayMark))
  }

  async function handleRefresh() {
    await store.refreshDay(date, true)
  }

  async function handleInvalidate() {
    await store.invalidateDay(date)
  }

  function handleWorkWindowChange(value: string) {
    if (value === "default") {
      onDeleteWorkWindow?.(date)
    } else if (value === "disabled") {
      onSetWorkWindow?.(date, "", "", "disabled")
    } else if (value === "nightshift" && nightShift) {
      onSetWorkWindow?.(date, nightShift.start, nightShift.end, "nightshift")
    } else if (value === "manual") {
      setCustomStart(workWindow?.start_time || "09:00")
      setCustomEnd(workWindow?.end_time || "21:30")
      setCustomOpen(true)
    }
  }

  const customValid = !!customStart && !!customEnd && customStart !== customEnd

  function handleCustomSave() {
    if (customValid) onSetWorkWindow?.(date, customStart, customEnd, "manual")
    setCustomOpen(false)
  }

  function openTargetDialogForType(type: DayTargetType) {
    setTargetType(type)
    const existing = dayTarget?.type === type ? dayTarget : null
    switch (type) {
      case "fixed": {
        const v = parseInt(existing?.value ?? "480", 10)
        setFixedHours(String(Math.floor(v / 60)))
        setFixedMins(String(v % 60))
        break
      }
      case "end-time":
        setEndTime(existing?.value ?? "17:30")
        break
      case "flex-balance": {
        const v = parseInt(existing?.value ?? "0", 10)
        setFlexSign(v >= 0 ? "+" : "-")
        const abs = Math.abs(v)
        setFlexHours(String(Math.floor(abs / 60)))
        setFlexMins(String(abs % 60))
        break
      }
      case "relative-offset": {
        const v = parseInt(existing?.value ?? "-60", 10)
        setOffsetSign(v >= 0 ? "+" : "-")
        const abs = Math.abs(v)
        setOffsetHours(String(Math.floor(abs / 60)))
        setOffsetMins(String(abs % 60))
        break
      }
    }
    setTargetOpen(true)
  }

  function buildTargetValue(): string | null {
    switch (targetType) {
      case "fixed":
        return String(parseInt(fixedHours || "0") * 60 + parseInt(fixedMins || "0"))
      case "end-time":
        return endTime
      case "flex-balance": {
        const abs = parseInt(flexHours || "0") * 60 + parseInt(flexMins || "0")
        return flexSign === "+" ? String(abs) : String(-abs)
      }
      case "relative-offset": {
        const abs = parseInt(offsetHours || "0") * 60 + parseInt(offsetMins || "0")
        return offsetSign === "+" ? String(abs) : String(-abs)
      }
      case "weekly-distribute":
        return null
    }
  }

  function isTargetValid(): boolean {
    switch (targetType) {
      case "fixed": {
        const total = parseInt(fixedHours || "0") * 60 + parseInt(fixedMins || "0")
        return total > 0
      }
      case "end-time":
        return !!endTime
      case "flex-balance":
        return true
      case "relative-offset": {
        const total = parseInt(offsetHours || "0") * 60 + parseInt(offsetMins || "0")
        return total > 0
      }
      case "weekly-distribute":
        return true
    }
  }

  async function handleTargetSave() {
    if (!isTargetValid() || !onSetTarget || isSaving) return
    setIsSaving(true)
    try {
      await onSetTarget(date, targetType, buildTargetValue())
      setTargetOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleTargetDelete() {
    await onDeleteTarget?.(date)
  }

  async function handleTargetSetDistribute() {
    await onSetTarget?.(date, "weekly-distribute", null)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>

        <ContextMenuContent className="min-w-52">
          {/* ── Date header ── */}
          <ContextMenuLabel className="flex flex-col gap-0.5 px-2.5 py-1.5">
            <span className="text-[10px] font-semibold tracking-wider text-muted-foreground/60 uppercase">
              Day
            </span>
            <span className="text-xs font-semibold text-foreground">
              {formatDayHeader(date)}
            </span>
          </ContextMenuLabel>

          <ContextMenuSeparator />

          {/* ── Mark as ── */}
          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2.5">
              <span className="flex items-center gap-2">
                {mark ? (
                  <span
                    className={`inline-block size-2 rounded-full ${
                      MARK_DEFS.find((m) => m.value === mark)?.dotClass ?? "bg-muted"
                    }`}
                  />
                ) : (
                  <span className="inline-block size-2 rounded-full bg-emerald-500/60" />
                )}
                Mark as
              </span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuRadioGroup value={mark ?? ""} onValueChange={handleMarkChange}>
                <ContextMenuRadioItem value="" className="gap-2.5">
                  <span className="inline-block size-2 rounded-full bg-emerald-500/60" />
                  Working Day
                </ContextMenuRadioItem>
                <ContextMenuSeparator />
                {MARK_DEFS.map(({ value, label, dotClass }) => (
                  <ContextMenuRadioItem key={value} value={value} className="gap-2.5">
                    <span className={`inline-block size-2 rounded-full ${dotClass}`} />
                    {label}
                  </ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          {/* ── Data ── */}
          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2.5">
              <HugeiconsIcon
                icon={Database02Icon}
                size={14}
                className="shrink-0 text-muted-foreground"
              />
              Data
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem
                className="gap-2.5"
                disabled={!isConnected || isFuture || isPermanent}
                onClick={handleRefresh}
              >
                <HugeiconsIcon icon={RefreshIcon} size={14} className="shrink-0" />
                Refresh cache
                {isPermanent && (
                  <span className="ml-auto text-[10px] text-muted-foreground/50">permanent</span>
                )}
              </ContextMenuItem>
              <ContextMenuItem
                className="gap-2.5"
                variant="destructive"
                disabled={!isCached}
                onClick={handleInvalidate}
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} className="shrink-0" />
                Invalidate cache
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          {/* ── Work Window ── */}
          {onSetWorkWindow && (
            <>
              <ContextMenuSeparator />
              <ContextMenuSub>
                <ContextMenuSubTrigger className="gap-2.5">
                  <HugeiconsIcon
                    icon={Time04Icon}
                    size={14}
                    className="shrink-0 text-muted-foreground"
                  />
                  Work Window
                  {workWindow && (
                    <span className="ml-auto text-[10px] text-muted-foreground/50">
                      {workWindow.source === "disabled"
                        ? "all entries"
                        : `${workWindow.start_time}–${workWindow.end_time}`}
                    </span>
                  )}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuRadioGroup
                    value={resolveRadioValue(workWindow)}
                    onValueChange={handleWorkWindowChange}
                  >
                    <ContextMenuRadioItem value="default" className="gap-2.5">
                      Default
                    </ContextMenuRadioItem>
                    {nightShift?.enabled && (
                      <ContextMenuRadioItem value="nightshift" className="gap-2.5">
                        Night Shift
                      </ContextMenuRadioItem>
                    )}
                    <ContextMenuRadioItem value="manual" className="gap-2.5">
                      Custom
                    </ContextMenuRadioItem>
                    <ContextMenuSeparator />
                    <ContextMenuRadioItem value="disabled" className="gap-2.5">
                      Disable this Day
                    </ContextMenuRadioItem>
                  </ContextMenuRadioGroup>
                </ContextMenuSubContent>
              </ContextMenuSub>
            </>
          )}

          {/* ── Target ── */}
          {onSetTarget && (
            <>
              <ContextMenuSeparator />
              <ContextMenuSub>
                <ContextMenuSubTrigger className="gap-2.5">
                  <HugeiconsIcon
                    icon={ClockCheckIcon}
                    size={14}
                    className="shrink-0 text-muted-foreground"
                  />
                  Target
                  {dayTarget && (
                    <span className="ml-auto text-muted-foreground/50">
                      {formatTargetSummary(dayTarget)}
                    </span>
                  )}
                </ContextMenuSubTrigger>

                <ContextMenuSubContent className="min-w-48">
                  {/* Default */}
                  <ContextMenuItem className="gap-2.5" onClick={handleTargetDelete}>
                    <span
                      className={`size-2 shrink-0 rounded-full ${
                        !dayTarget ? "bg-foreground" : "bg-muted-foreground/20"
                      }`}
                    />
                    Default
                    <span className="ml-auto text-muted-foreground/40">auto</span>
                  </ContextMenuItem>

                  <ContextMenuSeparator />

                  {/* Add/Reduce */}
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="gap-2.5">
                      <span
                        className={`size-2 shrink-0 rounded-full ${
                          dayTarget?.type === "relative-offset" ? "bg-primary" : "bg-muted-foreground/20"
                        }`}
                      />
                      Add/Reduce
                      {dayTarget?.type === "relative-offset" && (
                        <span className="ml-auto text-muted-foreground/50">
                          {formatTargetSummary(dayTarget)}
                        </span>
                      )}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="min-w-36">
                      <ContextMenuRadioGroup
                        value={dayTarget?.type === "relative-offset" ? (dayTarget.value ?? "") : ""}
                        onValueChange={(v) => onSetTarget?.(date, "relative-offset", v)}
                      >
                        <ContextMenuItem
                          className="gap-2.5"
                          onClick={() => openTargetDialogForType("relative-offset")}
                        >
                          Custom
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        {ADD_REDUCE_PRESETS.map((p) => (
                          <ContextMenuRadioItem key={p.value} value={p.value} className="gap-2.5 font-mono">
                            {p.label}
                          </ContextMenuRadioItem>
                        ))}
                      </ContextMenuRadioGroup>
                    </ContextMenuSubContent>
                  </ContextMenuSub>

                  {/* Work until */}
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="gap-2.5">
                      <span
                        className={`size-2 shrink-0 rounded-full ${
                          dayTarget?.type === "end-time" ? "bg-primary" : "bg-muted-foreground/20"
                        }`}
                      />
                      Work until
                      {dayTarget?.type === "end-time" && (
                        <span className="ml-auto text-muted-foreground/50">
                          {formatTargetSummary(dayTarget)}
                        </span>
                      )}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="min-w-36">
                      <ContextMenuRadioGroup
                        value={dayTarget?.type === "end-time" ? (dayTarget.value ?? "") : ""}
                        onValueChange={(v) => onSetTarget?.(date, "end-time", v)}
                      >
                        <ContextMenuItem
                          className="gap-2.5"
                          onClick={() => openTargetDialogForType("end-time")}
                        >
                          Custom
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        {WORK_UNTIL_PRESETS.map((p) => (
                          <ContextMenuRadioItem key={p.value} value={p.value} className="gap-2.5 font-mono">
                            {p.label}
                          </ContextMenuRadioItem>
                        ))}
                      </ContextMenuRadioGroup>
                    </ContextMenuSubContent>
                  </ContextMenuSub>

                  {/* Flex becomes */}
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="gap-2.5">
                      <span
                        className={`size-2 shrink-0 rounded-full ${
                          dayTarget?.type === "flex-balance" ? "bg-primary" : "bg-muted-foreground/20"
                        }`}
                      />
                      Flex becomes
                      {dayTarget?.type === "flex-balance" && (
                        <span className="ml-auto text-muted-foreground/50">
                          {formatTargetSummary(dayTarget)}
                        </span>
                      )}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="min-w-36">
                      <ContextMenuRadioGroup
                        value={dayTarget?.type === "flex-balance" ? (dayTarget.value ?? "") : ""}
                        onValueChange={(v) => onSetTarget?.(date, "flex-balance", v)}
                      >
                        <ContextMenuItem
                          className="gap-2.5"
                          onClick={() => openTargetDialogForType("flex-balance")}
                        >
                          Custom
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        {FLEX_BECOMES_PRESETS.map((p) => (
                          <ContextMenuRadioItem key={p.value} value={p.value} className="gap-2.5 font-mono">
                            {p.label}
                          </ContextMenuRadioItem>
                        ))}
                      </ContextMenuRadioGroup>
                    </ContextMenuSubContent>
                  </ContextMenuSub>

                  {/* Set Hours */}
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="gap-2.5">
                      <span
                        className={`size-2 shrink-0 rounded-full ${
                          dayTarget?.type === "fixed" ? "bg-primary" : "bg-muted-foreground/20"
                        }`}
                      />
                      Set Hours
                      {dayTarget?.type === "fixed" && (
                        <span className="ml-auto text-muted-foreground/50">
                          {formatTargetSummary(dayTarget)}
                        </span>
                      )}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="min-w-36">
                      <ContextMenuRadioGroup
                        value={dayTarget?.type === "fixed" ? (dayTarget.value ?? "") : ""}
                        onValueChange={(v) => onSetTarget?.(date, "fixed", v)}
                      >
                        <ContextMenuItem
                          className="gap-2.5"
                          onClick={() => openTargetDialogForType("fixed")}
                        >
                          Custom
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        {SET_HOURS_PRESETS.map((p) => (
                          <ContextMenuRadioItem key={p.value} value={p.value} className="gap-2.5 font-mono">
                            {p.label}
                          </ContextMenuRadioItem>
                        ))}
                      </ContextMenuRadioGroup>
                    </ContextMenuSubContent>
                  </ContextMenuSub>

                  <ContextMenuSeparator />

                  {/* Distribute on week — instant */}
                  <ContextMenuItem className="gap-2.5" onClick={handleTargetSetDistribute}>
                    <span
                      className={`size-2 shrink-0 rounded-full ${
                        dayTarget?.type === "weekly-distribute" ? "bg-primary" : "bg-muted-foreground/20"
                      }`}
                    />
                    Spread across week
                    <span className="ml-auto text-muted-foreground/40">auto</span>
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* ── Custom work window dialog ── */}
      <AlertDialog open={customOpen} onOpenChange={setCustomOpen}>
        <AlertDialogContent className="max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Custom Work Window</AlertDialogTitle>
            <p className="text-xs text-muted-foreground">
              Set a custom time range for {formatDayHeader(date)}
            </p>
          </AlertDialogHeader>

          <div className="flex items-center gap-3 py-2">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">Start</label>
              <Input
                type="time"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-8 font-mono text-xs"
              />
            </div>
            <span className="mt-5 text-xs text-muted-foreground/40">to</span>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">End</label>
              <Input
                type="time"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCustomSave}
              disabled={!customValid}
              className="h-8 text-xs"
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Custom target dialog ── */}
      <AlertDialog open={targetOpen} onOpenChange={setTargetOpen}>
        <AlertDialogContent className="max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              {TARGET_LABELS[targetType]}
            </AlertDialogTitle>
            <p className="text-xs text-muted-foreground/60">{formatDayHeader(date)}</p>
            <p className="text-xs text-muted-foreground">{TARGET_DESCRIPTIONS[targetType]}</p>
          </AlertDialogHeader>

          <div className="py">
            {/* fixed */}
            {targetType === "fixed" && (
              <div className="flex items-center gap-2">
                <HMInputs
                  hours={fixedHours}
                  mins={fixedMins}
                  onHours={setFixedHours}
                  onMins={setFixedMins}
                />
              </div>
            )}

            {/* end-time */}
            {targetType === "end-time" && (
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="h-9 w-32 font-mono text-sm"
              />
            )}

            {/* flex-balance */}
            {targetType === "flex-balance" && (
              <div className="flex items-center gap-2">
                <SignToggle value={flexSign} onChange={setFlexSign} />
                <HMInputs
                  hours={flexHours}
                  mins={flexMins}
                  onHours={setFlexHours}
                  onMins={setFlexMins}
                />
              </div>
            )}

            {/* relative-offset */}
            {targetType === "relative-offset" && (
              <div className="flex items-center gap-2">
                <SignToggle value={offsetSign} onChange={setOffsetSign} />
                <HMInputs
                  hours={offsetHours}
                  mins={offsetMins}
                  onHours={setOffsetHours}
                  onMins={setOffsetMins}
                />
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTargetSave}
              disabled={!isTargetValid() || isSaving}
              className="h-8 text-xs"
            >
              {isSaving ? "Saving" : "Set Target"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
