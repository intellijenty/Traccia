import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { HugeiconsIcon } from "@hugeicons/react"
import { PencilEdit01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons"
import type { EntryType } from "@/lib/types"

function getLocalTime(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
}

function addMinutes(time: string, minutes: number): string {
  const [h, m, s] = time.split(":").map(Number)
  const total = (h * 60 + m + minutes) % (24 * 60)
  const nh = Math.floor(total / 60)
  const nm = total % 60
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}:${String(s ?? 0).padStart(2, "0")}`
}

interface ManualEntryProps {
  date?: string
  onAddEntry: (data: {
    date: string
    time: string
    type: EntryType
    notes?: string
  }) => Promise<void>
  onAddEntryPair: (data: {
    date: string
    time1: string
    time2: string
  }) => Promise<void>
}

export function ManualEntry({
  date,
  onAddEntry,
  onAddEntryPair,
}: ManualEntryProps) {
  const entryDate = date ?? new Date().toLocaleDateString("en-CA")

  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<"single" | "break">("single")

  // Single mode state
  const [time, setTime] = useState(getLocalTime)
  const [type, setType] = useState<EntryType>("LOGIN")

  // Pair mode state
  const [pairTime1, setPairTime1] = useState(getLocalTime)
  const [pairTime2, setPairTime2] = useState(() =>
    addMinutes(getLocalTime(), 5)
  )

  const [submitting, setSubmitting] = useState(false)

  function handleOpenChange(open: boolean) {
    if (open) {
      const now = getLocalTime()
      setTime(now)
      setPairTime1(now)
      setPairTime2(addMinutes(now, 5))
    }
    setIsOpen(open)
  }

  async function handleSubmitSingle() {
    setSubmitting(true)
    try {
      await onAddEntry({ date: entryDate, time, type })
      setTime(getLocalTime())
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitPair() {
    setSubmitting(true)
    try {
      await onAddEntryPair({
        date: entryDate,
        time1: pairTime1,
        time2: pairTime2,
      })
      const now = getLocalTime()
      setPairTime1(now)
      setPairTime2(addMinutes(now, 5))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-lg border border-border/50 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
          <HugeiconsIcon icon={PencilEdit01Icon} size={14} />
          <span>Add entry with custom time</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={14}
            className={`ml-auto transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-3 rounded-lg border border-border/50 bg-card/50 p-4">
          {/* Mode toggle */}
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => {
              if (v) setMode(v as "single" | "break")
            }}
            className="flex h-8 w-full gap-1 rounded-md border border-border/50 bg-muted/20 p-0.5"
          >
            <ToggleGroupItem
              value="single"
              className="h-7 flex-1 text-xs font-medium data-[state=on]:bg-muted data-[state=on]:text-foreground"
            >
              Single
            </ToggleGroupItem>
            <ToggleGroupItem
              value="break"
              className="h-7 flex-1 text-xs font-medium data-[state=on]:bg-muted data-[state=on]:text-foreground"
            >
              Pair
            </ToggleGroupItem>
          </ToggleGroup>

          {mode === "single" ? (
            <>
              <div className="flex gap-3">
                {/* Time input */}
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Time
                  </label>
                  <Input
                    type="time"
                    step="1"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                {/* Type toggle */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Type
                  </label>
                  <ToggleGroup
                    type="single"
                    value={type}
                    onValueChange={(v) => {
                      if (v) setType(v as EntryType)
                    }}
                    className="h-9 rounded-md border border-border/50 bg-muted/20 p-0.5"
                  >
                    <ToggleGroupItem
                      value="LOGIN"
                      className="h-8 px-4 text-xs font-semibold data-[state=on]:border-emerald-500/30 data-[state=on]:bg-emerald-500/10 data-[state=on]:text-emerald-400"
                    >
                      IN
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="LOGOUT"
                      className="h-8 px-4 text-xs font-semibold data-[state=on]:border-red-500/30 data-[state=on]:bg-red-500/10 data-[state=on]:text-red-400"
                    >
                      OUT
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>

              <Button
                className="w-full"
                size="sm"
                onClick={handleSubmitSingle}
                disabled={submitting}
              >
                Add Entry
              </Button>
            </>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">
                Types are assigned automatically to keep the sequence valid.
              </p>
              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Time 1
                  </label>
                  <Input
                    type="time"
                    step="1"
                    value={pairTime1}
                    onChange={(e) => setPairTime1(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Time 2
                  </label>
                  <Input
                    type="time"
                    step="1"
                    value={pairTime2}
                    onChange={(e) => setPairTime2(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <Button
                className="w-full"
                size="sm"
                onClick={handleSubmitPair}
                disabled={submitting}
              >
                Add Pair
              </Button>
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
