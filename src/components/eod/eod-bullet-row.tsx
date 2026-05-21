import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { GripVertical } from 'lucide-react'
import type React from 'react'

// ── GripHandle ────────────────────────────────────────────────────────────────

export function GripHandle(props: React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      tabIndex={-1}
      aria-label="Drag to reorder"
      className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing flex items-center text-muted-foreground/40 hover:text-muted-foreground transition-opacity touch-none shrink-0"
    >
      <GripVertical className="size-3.5" />
    </button>
  )
}

// ── BulletRow primitive ───────────────────────────────────────────────────────
// One row = grip + bullet glyph + text input + remove button.
// Shared by task row, sub-bullet row, and section item row.

export type BulletMarker = 'task' | 'sub'

interface BulletRowProps {
  inputRef: React.RefCallback<HTMLInputElement>
  text: string
  placeholder: string
  marker: BulletMarker
  onUpdate: (text: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onRemove: () => void
  removeAriaLabel: string
  /** dnd-kit useSortable().attributes — spread onto grip handle */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragAttributes?: any
  /** dnd-kit useSortable().listeners — spread onto grip handle */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragListeners?: any
  /** Outer wrapper class (controls padding variants per use site) */
  className?: string
  removeSize?: 'icon-xs' | 'icon-sm'
}

export function BulletRow({
  inputRef, text, placeholder, marker,
  onUpdate, onKeyDown, onRemove, removeAriaLabel,
  dragAttributes, dragListeners, className, removeSize = 'icon-xs',
}: BulletRowProps) {
  const isTask = marker === 'task'
  return (
    <div className={cn('group flex items-center gap-2.5', className)}>
      <GripHandle {...dragAttributes} {...dragListeners} />
      <span
        className={cn(
          'shrink-0 select-none',
          isTask ? 'text-foreground/50 text-xs' : 'text-foreground/40 text-[10px]',
        )}
      >
        {isTask ? '●' : '○'}
      </span>
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={e => onUpdate(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent py-1.5 text-[15px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
      />
      <Button
        variant="ghost"
        size={removeSize}
        tabIndex={-1}
        onClick={onRemove}
        aria-label={removeAriaLabel}
        className="shrink-0 text-sm leading-none opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
      >
        <HugeiconsIcon icon={Cancel01Icon} className="shrink-0" />
      </Button>
    </div>
  )
}

// ── Keyboard handler builder ──────────────────────────────────────────────────
// Centralizes Enter / Tab / Backspace-empty / Shift+Del / Arrow patterns.
// Each call site only specifies the keys it actually cares about.

export interface BulletKeyHandlers {
  onEnter?: () => void
  onCtrlEnter?: () => void
  onTab?: () => void
  onShiftTab?: () => void
  /** Fires on Backspace when input is empty, or Shift+Delete regardless. */
  onDeleteEmpty?: () => void
  onArrowUp?: () => void
  onArrowDown?: () => void
  onAltArrowUp?: () => void
  onAltArrowDown?: () => void
  onAltShiftArrowUp?: () => void
  onAltShiftArrowDown?: () => void
  onAltD?: () => void
}

// eslint-disable-next-line react-refresh/only-export-components
export function bulletKeyDown(text: string, h: BulletKeyHandlers) {
  return (e: React.KeyboardEvent) => {
    // Ctrl+Enter only takes a special path when explicitly handled.
    // Otherwise it falls through to plain Enter — matches the original
    // behavior where the UI advertises Ctrl+Enter as a synonym for Enter
    // on tasks and section items.
    if (e.key === 'Enter' && e.ctrlKey && h.onCtrlEnter) {
      e.preventDefault(); h.onCtrlEnter()
      return
    }
    if (e.key === 'Enter') {
      if (h.onEnter) { e.preventDefault(); h.onEnter() }
      return
    }
    if (e.key === 'Tab' && e.shiftKey) {
      if (h.onShiftTab) { e.preventDefault(); h.onShiftTab() }
      return
    }
    if (e.key === 'Tab') {
      if (h.onTab) { e.preventDefault(); h.onTab() }
      return
    }
    if ((e.key === 'Backspace' && text === '') || (e.key === 'Delete' && e.shiftKey)) {
      if (h.onDeleteEmpty) { e.preventDefault(); h.onDeleteEmpty() }
      return
    }
    if (e.key === 'd' && e.altKey) {
      if (h.onAltD) { e.preventDefault(); h.onAltD() }
      return
    }
    if (e.key === 'ArrowUp' && e.altKey && e.shiftKey) {
      if (h.onAltShiftArrowUp) { e.preventDefault(); h.onAltShiftArrowUp() }
      return
    }
    if (e.key === 'ArrowDown' && e.altKey && e.shiftKey) {
      if (h.onAltShiftArrowDown) { e.preventDefault(); h.onAltShiftArrowDown() }
      return
    }
    if (e.key === 'ArrowUp' && e.altKey) {
      if (h.onAltArrowUp) { e.preventDefault(); h.onAltArrowUp() }
      return
    }
    if (e.key === 'ArrowDown' && e.altKey) {
      if (h.onAltArrowDown) { e.preventDefault(); h.onAltArrowDown() }
      return
    }
    if (e.key === 'ArrowUp') {
      if (h.onArrowUp) { e.preventDefault(); h.onArrowUp() }
      return
    }
    if (e.key === 'ArrowDown') {
      if (h.onArrowDown) { e.preventDefault(); h.onArrowDown() }
      return
    }
  }
}
