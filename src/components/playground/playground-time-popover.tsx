import { useState, type ReactNode } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface TimePopoverProps {
  trigger: ReactNode
  title: string
  submitLabel: string
  initialH?: number
  initialM?: number
  align?: "start" | "end"
  onSubmit: (hours: number, minutes: number) => void
}

function to12hr(h24: number): { h: number; ampm: "AM" | "PM" } {
  if (h24 === 0) return { h: 12, ampm: "AM" }
  if (h24 < 12) return { h: h24, ampm: "AM" }
  if (h24 === 12) return { h: 12, ampm: "PM" }
  return { h: h24 - 12, ampm: "PM" }
}

function to24hr(h12: number, ampm: "AM" | "PM"): number {
  if (ampm === "AM") return h12 === 12 ? 0 : h12
  return h12 === 12 ? 12 : h12 + 12
}

export function TimePopover({
  trigger,
  title,
  submitLabel,
  initialH = 12,
  initialM = 0,
  align = "start",
  onSubmit,
}: TimePopoverProps) {
  const init12 = to12hr(initialH)
  const [open, setOpen] = useState(false)
  const [h, setH] = useState(init12.h)
  const [m, setM] = useState(initialM)
  const [ampm, setAmpm] = useState<"AM" | "PM">(init12.ampm)

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          const r = to12hr(initialH)
          setH(r.h)
          setM(initialM)
          setAmpm(r.ampm)
        }
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="p-4" align={align}>
        <div className="space-y-4">
          <p className="text-sm font-medium">{title}</p>

          <div className="space-y-1.5">
            {/* Label row */}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="w-14 text-center">Hr</span>
              <span className="w-3" />
              <span className="w-14 text-center">Min</span>
            </div>

            {/* Input row */}
            <div className="flex items-center gap-2">
              <TimeInput value={h} min={1} max={12} onChange={setH} />
              <span className="w-3 select-none text-center text-base font-light text-muted-foreground/40">
                :
              </span>
              <TimeInput value={m} min={0} max={59} onChange={setM} pad />
              <AmPmToggle value={ampm} onChange={setAmpm} />
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={() => {
              onSubmit(to24hr(h, ampm), m)
              setOpen(false)
            }}
          >
            {submitLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TimeInput({
  value,
  min,
  max,
  pad,
  onChange,
}: {
  value: number
  min: number
  max: number
  pad?: boolean
  onChange: (n: number) => void
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n))

  return (
    <input
      type="text"
      inputMode="numeric"
      value={pad ? String(value).padStart(2, "0") : String(value)}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const n = parseInt(e.target.value.replace(/\D/g, ""), 10)
        if (!isNaN(n)) onChange(clamp(n))
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") { e.preventDefault(); onChange(clamp(value + 1)) }
        if (e.key === "ArrowDown") { e.preventDefault(); onChange(clamp(value - 1)) }
      }}
      onWheel={(e) => {
        e.currentTarget.blur()
        onChange(clamp(value + (e.deltaY < 0 ? 1 : -1)))
      }}
      className="w-14 rounded-md border border-border bg-background py-1.5 text-center text-sm font-medium tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
    />
  )
}

function AmPmToggle({
  value,
  onChange,
}: {
  value: "AM" | "PM"
  onChange: (v: "AM" | "PM") => void
}) {
  return (
    <div className="flex rounded-md border border-border bg-muted/30 p-0.5">
      {(["AM", "PM"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "rounded px-2 py-1 text-xs font-semibold transition-all",
            value === v
              ? "bg-background text-foreground shadow-sm ring-1 ring-border"
              : "text-muted-foreground hover:text-foreground/70"
          )}
        >
          {v}
        </button>
      ))}
    </div>
  )
}
