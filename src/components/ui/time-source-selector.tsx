/**
 * TimeSourceSelector
 *
 * Reusable compact toggle group for selecting a time data source (local vs portal).
 * Designed to be dropped anywhere — notifications settings, future custom-target
 * rows, or any other feature that needs source selection.
 *
 * Props:
 *   value      — current source
 *   onChange   — called with the new source (never called with empty string)
 *   disabled   — greys out and blocks interaction
 *   className  — appended to the root element
 */

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TIME_SOURCES, type TimeSource } from "@/lib/time-source"
import { cn } from "@/lib/utils"

interface TimeSourceSelectorProps {
  value: TimeSource
  onChange: (value: TimeSource) => void
  disabled?: boolean
  className?: string
}

export function TimeSourceSelector({
  value,
  onChange,
  disabled,
  className,
}: TimeSourceSelectorProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => {
        // Radix fires empty string when user clicks the active item — ignore it
        if (v) onChange(v as TimeSource)
      }}
      disabled={disabled}
      className={cn(
        "inline-flex gap-0.5 rounded-md border border-border/40 bg-muted/30 p-0.5",
        className
      )}
    >
      {TIME_SOURCES.map((src) => (
        <ToggleGroupItem
          key={src.value}
          value={src.value}
          title={src.description}
          className="h-6 rounded-[5px] px-2.5 text-[11px] font-medium"
        >
          {src.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
