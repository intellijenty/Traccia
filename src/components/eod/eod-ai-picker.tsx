// Structured, selectable view of an AI-generated draft. The user ticks the
// tasks / sub-bullets / section items they want; the parent dialog turns the
// resulting selection into a subset and merges it into the form.
//
// Presentational: all selection maths live in eod-ai-selection.ts. This emits a
// new selection Set on every toggle.

import { useRef, type ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { EodFormState } from '@/lib/eod-types'
import {
  PICKER_SECTIONS,
  projectCheck,
  toggleProject,
  toggleSectionItem,
  toggleSub,
  toggleTask,
  hasSelectable,
  setRange,
} from '@/lib/eod-ai-selection'

const SECTION_TITLES: Record<(typeof PICKER_SECTIONS)[number], string> = {
  otherTasks: 'Other Tasks',
  concerns: 'Concerns',
  nextDayPlan: 'Plan for Next Day',
}

interface EodDraftPickerProps {
  draft: EodFormState
  selected: Set<string>
  /** Items already pulled into the form this run — dimmed + tagged. */
  added: Set<string>
  onChange: (next: Set<string>) => void
}

export function EodDraftPicker({ draft, selected, added, onChange }: EodDraftPickerProps) {
  // Anchor for shift-range select: the last leaf row toggled. Shift-clicking
  // another row sets everything between to that click's resulting state.
  const anchorRef = useRef<string | null>(null)

  const onLeaf = (id: string, next: boolean, shift: boolean, normal: () => Set<string>) => {
    if (shift && anchorRef.current && anchorRef.current !== id) {
      onChange(setRange(draft, selected, anchorRef.current, id, next))
    } else {
      onChange(normal())
    }
    anchorRef.current = id
  }

  if (!hasSelectable(draft)) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Nothing to pick in this draft.</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full bg-background">
      <div className="space-y-5 p-3">
        {draft.projects.map(project => {
          if (project.tasksCompleted.length === 0) return null
          const state = projectCheck(draft, selected, project.id)
          return (
            <div key={project.id} className="space-y-0.5">
              <CheckRow
                strong
                checked={state === 'all'}
                indeterminate={state === 'some'}
                onToggle={() => onChange(toggleProject(draft, selected, project.id))}
              >
                {project.name || 'Project'}
              </CheckRow>
              {project.tasksCompleted.map(task => (
                <div key={task.id}>
                  <CheckRow
                    indent={1}
                    checked={selected.has(task.id)}
                    added={added.has(task.id)}
                    onToggle={(next, shift) => onLeaf(task.id, next, shift, () => toggleTask(draft, selected, task.id))}
                  >
                    {task.text}
                  </CheckRow>
                  {task.subBullets.map(sub => (
                    <CheckRow
                      key={sub.id}
                      indent={2}
                      checked={selected.has(sub.id)}
                      added={added.has(sub.id)}
                      onToggle={(next, shift) => onLeaf(sub.id, next, shift, () => toggleSub(selected, task.id, sub.id))}
                    >
                      {sub.text}
                    </CheckRow>
                  ))}
                </div>
              ))}
            </div>
          )
        })}

        {PICKER_SECTIONS.map(sk => {
          const items = draft[sk].items
          if (items.length === 0) return null
          return (
            <div key={sk} className="space-y-0.5">
              <p className="px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {SECTION_TITLES[sk]}
              </p>
              {items.map(item => (
                <CheckRow
                  key={item.id}
                  indent={1}
                  checked={selected.has(item.id)}
                  added={added.has(item.id)}
                  onToggle={(next, shift) => onLeaf(item.id, next, shift, () => toggleSectionItem(selected, item.id))}
                >
                  {item.text}
                </CheckRow>
              ))}
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

// ── Row ─────────────────────────────────────────────────────────────────────

interface CheckRowProps {
  checked: boolean
  /** `next` = the resulting checked state; `shift` = shift held at click time. */
  onToggle: (next: boolean, shift: boolean) => void
  indeterminate?: boolean
  added?: boolean
  strong?: boolean
  indent?: 0 | 1 | 2
  children: ReactNode
}

const INDENT = ['pl-2', 'pl-7', 'pl-12'] as const

function CheckRow({ checked, onToggle, indeterminate, added, strong, indent = 0, children }: CheckRowProps) {
  // Radix's onCheckedChange carries no event, so latch the shift key from the
  // interaction that triggers it (mouse or keyboard) just before it fires.
  const shiftRef = useRef(false)
  return (
    <label
      onMouseDownCapture={e => { shiftRef.current = e.shiftKey }}
      onKeyDownCapture={e => { shiftRef.current = e.shiftKey }}
      className={cn(
        'group flex cursor-pointer select-none items-start gap-2.5 rounded-md py-1.5 pr-2 transition-colors hover:bg-muted/50',
        INDENT[indent],
      )}
    >
      <Checkbox
        checked={indeterminate ? 'indeterminate' : checked}
        onCheckedChange={c => onToggle(c === true, shiftRef.current)}
        className="mt-0.5 shrink-0"
      />
      <span
        className={cn(
          'min-w-0 flex-1 text-sm leading-snug',
          added ? 'text-muted-foreground' : 'text-foreground',
          strong && 'font-medium',
        )}
      >
        {children}
      </span>
      {added && (
        <span className="mt-0.5 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          added
        </span>
      )}
    </label>
  )
}
