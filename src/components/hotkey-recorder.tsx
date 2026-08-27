import { useState, useEffect, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

// ── Key utilities ─────────────────────────────────────────────────────────────

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"])

/** Build ordered display parts from a KeyboardEvent */
function eventToKeys(e: KeyboardEvent): string[] {
  const parts: string[] = []
  if (e.ctrlKey) parts.push("Ctrl")
  if (e.altKey) parts.push("Alt")
  if (e.shiftKey) parts.push("Shift")
  if (e.metaKey) parts.push("Super")
  if (!MODIFIER_KEYS.has(e.key)) {
    parts.push(e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key)
  }
  return parts
}

/** Convert display keys array → Electron accelerator string */
export function keysToAccelerator(keys: string[]): string {
  return keys.join("+")
}

/** Parse Electron accelerator → display keys array */
export function acceleratorToKeys(combo: string): string[] {
  if (!combo) return []
  return combo.split("+").filter(Boolean)
}

// ── Key Badge ─────────────────────────────────────────────────────────────────

function KeyBadge({
  label,
  size = "md",
}: {
  label: string
  size?: "sm" | "md"
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border bg-muted/60 font-mono font-medium text-foreground/90",
        size === "sm"
          ? "min-w-[28px] px-1.5 py-0.5 text-[10px]"
          : "min-w-[36px] px-2 py-1 text-xs"
      )}
    >
      {label}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface HotkeyRecorderProps {
  value: string // Electron accelerator, e.g. "Alt+Space"
  defaultValue?: string
  requireModifier?: boolean
  onChange: (combo: string) => void
}

export function HotkeyRecorder({
  value,
  defaultValue = "Alt+Space",
  requireModifier = false,
  onChange,
}: HotkeyRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [pendingKeys, setPendingKeys] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentKeys = acceleratorToKeys(value)

  const startRecording = useCallback(() => {
    setPendingKeys(currentKeys)
    setError(null)
    setRecording(true)
  }, [currentKeys])

  const cancelRecording = useCallback(() => {
    setRecording(false)
    setPendingKeys([])
    setError(null)
  }, [])

  const saveRecording = useCallback(() => {
    if (pendingKeys.length < 2) {
      setError("Shortcut must include at least one modifier + one key")
      return
    }
    if (requireModifier) {
      const MODS = new Set(["Ctrl", "Alt", "Shift", "Super"])
      const hasMod = pendingKeys.some((k) => MODS.has(k))
      if (!hasMod) {
        setError("Must include a modifier key (Ctrl, Alt, Shift)")
        return
      }
    }
    onChange(keysToAccelerator(pendingKeys))
    setRecording(false)
    setPendingKeys([])
    setError(null)
  }, [pendingKeys, requireModifier, onChange])

  // Keyboard capture while recording
  useEffect(() => {
    if (!recording) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === "Escape") {
        cancelRecording()
        return
      }

      if (e.key === "Enter") {
        saveRecording()
        return
      }

      if (e.key === "Backspace") {
        setPendingKeys([])
        setError(null)
        return
      }

      const keys = eventToKeys(e)
      if (keys.length > 0) {
        setPendingKeys(keys)
        setError(null)
      }
    }

    // Capture phase so we intercept before anything else
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [recording, cancelRecording, saveRecording])

  // Click-outside to cancel
  useEffect(() => {
    if (!recording) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        cancelRecording()
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [recording, cancelRecording])

  const displayKeys = recording ? pendingKeys : currentKeys

  return (
    <div ref={containerRef} className="relative">
      {/* ── Display row ── */}
      <div className="flex items-center gap-2">
        {/* Clickable hotkey display */}
        <button
          type="button"
          onClick={startRecording}
          className={cn(
            "flex min-w-24 items-center gap-1.5 rounded-lg border px-3 py-2 transition-colors",
            recording
              ? "border-primary/50 bg-primary/5 ring-2 ring-primary/20"
              : "border-border/60 bg-muted/30 hover:border-border hover:bg-muted/50"
          )}
        >
          {currentKeys.length > 0 ? (
            currentKeys.map((k, i) => <KeyBadge key={i} label={k} size="sm" />)
          ) : (
            <span className="text-[11px] text-muted-foreground">Click to set</span>
          )}
        </button>

        {/* Reset to default */}
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              onClick={() => {
                onChange(defaultValue)
                setError(null)
              }}
              className="rounded-md p-1.5 text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-muted-foreground"
            >
              <svg
                className="size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent>Reset to default</TooltipContent>
        </Tooltip>
      </div>

      {/* ── Recording popup ── */}
      {recording && (
        <div className="absolute top-full left-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border/60 bg-popover shadow-xl ring-1 ring-foreground/5">
          {/* Instruction */}
          <div className="border-b border-border/40 px-4 py-3 text-center">
            <p className="text-[11px] text-muted-foreground">
              Press{" "}
              <span className="font-semibold text-foreground/70">Backspace</span>{" "}
              to clear &nbsp;
            </p>
          </div>

          {/* Current key combo */}
          <div className="flex min-h-[56px] items-center justify-center gap-1.5 px-4 py-3">
            {displayKeys.length > 0 ? (
              displayKeys.map((k, i) => <KeyBadge key={i} label={k} />)
            ) : (
              <span className="text-xs text-muted-foreground/50">
                Press a key combination…
              </span>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="px-4 pb-2 text-center text-[10px] text-red-400">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-border/40 px-3 py-2">
            <button
              type="button"
              onClick={cancelRecording}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              Close
              <KeyBadge label="Esc" size="sm" />
            </button>
            <button
              type="button"
              onClick={saveRecording}
              disabled={pendingKeys.length < 2}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-40"
            >
              Save
              <KeyBadge label="↵" size="sm" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
