import { memo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { normalizeTaskText } from '@/lib/task-text-parser'
import type { EodTask, EodSubBullet, EodSimpleSection, EodSectionItem } from '@/lib/eod-types'
import { Button } from '../ui/button'
import { Kbd } from '../ui/kbd'
import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SectionKey } from './eod-dnd'
import { BulletRow, bulletKeyDown } from './eod-bullet-row'
import { useEodApi, useEodDndState, useProjectId } from './eod-form-context'

// ── SortableSub ───────────────────────────────────────────────────────────────

interface SortableSubProps {
  taskId: string
  sub: EodSubBullet
}

export const SortableSub = memo(function SortableSub({ taskId, sub }: SortableSubProps) {
  const { actions, focus } = useEodApi()
  const projectId = useProjectId()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sub.id })

  const onNormalize = useCallback(() => {
    const normalized = normalizeTaskText(sub.text)
    if (normalized !== sub.text) actions.updateSub(projectId, taskId, sub.id, normalized)
  }, [sub.text, sub.id, taskId, projectId, actions])

  const onKeyDown = bulletKeyDown(sub.text, {
    onCtrlC: () => navigator.clipboard.writeText(sub.text),
    onCtrlEnter: () => actions.addTaskAfter(projectId, taskId),
    onEnter: () => actions.addSub(projectId, taskId, sub.id),
    onShiftTab: () => focus.focus(`task:${taskId}`),
    onDeleteEmpty: () => {
      focus.focusPrev(`sub:${taskId}:${sub.id}`)
      actions.removeSub(projectId, taskId, sub.id)
    },
    onArrowDown: () => focus.focusNext(`sub:${taskId}:${sub.id}`),
    onArrowUp: () => focus.focusPrev(`sub:${taskId}:${sub.id}`),
    onAltD:              () => actions.duplicateItem({ type: 'sub', projectId, taskId, subId: sub.id }),
    onAltArrowUp:        () => actions.moveUp({ type: 'sub', projectId, taskId, subId: sub.id }),
    onAltArrowDown:      () => actions.moveDown({ type: 'sub', projectId, taskId, subId: sub.id }),
    onAltShiftArrowUp:   () => { actions.reorderUp({ type: 'task', projectId, taskId }); focus.focus(`sub:${taskId}:${sub.id}`) },
    onAltShiftArrowDown: () => { actions.reorderDown({ type: 'task', projectId, taskId }); focus.focus(`sub:${taskId}:${sub.id}`) },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
    >
      <BulletRow
        inputRef={focus.reg(`sub:${taskId}:${sub.id}`) as React.RefCallback<HTMLInputElement>}
        text={sub.text}
        placeholder="Task detail"
        marker="sub"
        onUpdate={text => actions.updateSub(projectId, taskId, sub.id, text)}
        onKeyDown={onKeyDown}
        onBlur={onNormalize}
        onRemove={() => actions.removeSub(projectId, taskId, sub.id)}
        removeAriaLabel="Remove sub-bullet"
        dragAttributes={attributes}
        dragListeners={listeners}
        className="pl-6"
      />
    </div>
  )
})

// ── SortableTaskCard ──────────────────────────────────────────────────────────

interface SortableTaskCardProps {
  task: EodTask
}

export const SortableTaskCard = memo(function SortableTaskCard({ task }: SortableTaskCardProps) {
  const { mode, actions, focus } = useEodApi()
  const projectId = useProjectId()
  const { activeId } = useEodDndState()
  const anyItemDragging = activeId !== null

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })
  const { setNodeRef: setSubDropRef, isOver: isSubOver } = useDroppable({ id: `subs:${task.id}` })

  const onNormalize = useCallback(() => {
    const normalized = normalizeTaskText(task.text)
    if (normalized !== task.text) actions.updateTask(projectId, task.id, normalized)
  }, [task.text, task.id, projectId, actions])

  const onKeyDown = bulletKeyDown(task.text, {
    onCtrlC: () => navigator.clipboard.writeText(task.text),
    onEnter: () => actions.addTaskAfter(projectId, task.id),
    onTab: () => {
      if (task.subBullets.length > 0) {
        focus.focus(`sub:${task.id}:${task.subBullets[0].id}`)
      } else {
        actions.addSub(projectId, task.id)
      }
    },
    onDeleteEmpty: () => {
      focus.focusPrev(`task:${task.id}`)
      actions.removeTask(projectId, task.id)
    },
    onArrowDown: () => focus.focusNext(`task:${task.id}`),
    onArrowUp: () => focus.focusPrev(`task:${task.id}`),
    onAltD:              () => actions.duplicateItem({ type: 'task', projectId, taskId: task.id }),
    onAltArrowUp:        () => actions.moveUp({ type: 'task', projectId, taskId: task.id }),
    onAltArrowDown:      () => actions.moveDown({ type: 'task', projectId, taskId: task.id }),
    onAltShiftArrowUp:   () => { actions.reorderUp({ type: 'task', projectId, taskId: task.id }); focus.focus(`task:${task.id}`) },
    onAltShiftArrowDown: () => { actions.reorderDown({ type: 'task', projectId, taskId: task.id }); focus.focus(`task:${task.id}`) },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group/card rounded-lg border border-border/40 bg-muted/5',
        isDragging && 'opacity-40 z-10 relative shadow-lg',
        task.meetingKey && 'border-l-2 border-l-primary',
      )}
    >
      <BulletRow
        inputRef={focus.reg(`task:${task.id}`) as React.RefCallback<HTMLInputElement>}
        text={task.text}
        placeholder="Ticket or task description"
        marker="task"
        onUpdate={text => actions.updateTask(projectId, task.id, text)}
        onKeyDown={onKeyDown}
        onBlur={onNormalize}
        onRemove={() => actions.removeTask(projectId, task.id)}
        removeAriaLabel="Remove task"
        dragAttributes={attributes}
        dragListeners={listeners}
        className="px-4 pt-1.5"
        removeSize="icon-sm"
      />

      {/* Sub-bullets + drop zone */}
      <div
        ref={setSubDropRef}
        className={cn(
          'px-4 space-y-0.5 transition-all',
          task.subBullets.length > 0 ? 'pb-1' : '',
          isSubOver
            ? 'py-2 rounded-b-lg bg-muted/20'
            : anyItemDragging && task.subBullets.length === 0
              ? 'py-2 rounded-b-lg border border-dashed border-border/60'
              : '',
        )}
      >
        {anyItemDragging && task.subBullets.length === 0 && !isSubOver && (
          <span className="flex justify-center text-[10px] text-muted-foreground/40 select-none">
            drop as sub-bullet
          </span>
        )}
        <SortableContext
          items={task.subBullets.map(s => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {task.subBullets.map(sub => (
            <SortableSub key={sub.id} taskId={task.id} sub={sub} />
          ))}
        </SortableContext>
      </div>

      {/* Add sub-bullet hint */}
      {mode !== 'zen' && (
        <div
          className={cn(
            'flex items-center gap-1 px-4 pl-10',
            mode === 'comfortable'
              ? 'pb-2.5 pt-0.5'
              : 'h-7 opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 transition-opacity duration-150',
          )}
        >
          <Button
            type="button"
            variant="outline"
            size="xs"
            tabIndex={-1}
            onClick={() => actions.addSub(projectId, task.id)}
            className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            + sub-bullet
          </Button>
          <Kbd className="ml-1 h-5 text-xs">
            {task.subBullets.length === 0 ? 'Tab' : 'Enter'}
          </Kbd>
        </div>
      )}
    </div>
  )
})

// ── SortableSectionItem ───────────────────────────────────────────────────────

interface SortableSectionItemProps {
  sk: SectionKey
  item: EodSectionItem
  placeholder: string
}

export const SortableSectionItem = memo(function SortableSectionItem({
  sk, item, placeholder,
}: SortableSectionItemProps) {
  const { actions, focus } = useEodApi()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const onNormalize = useCallback(() => {
    const normalized = normalizeTaskText(item.text)
    if (normalized !== item.text) actions.updateSectionItem(sk, item.id, normalized)
  }, [item.text, item.id, sk, actions])

  const onKeyDown = bulletKeyDown(item.text, {
    onCtrlC: () => navigator.clipboard.writeText(item.text),
    onEnter: () => actions.addSectionItem(sk, item.id),
    onDeleteEmpty: () => {
      focus.focusPrev(`section:${sk}:${item.id}`)
      actions.removeSectionItem(sk, item.id)
    },
    onArrowDown: () => focus.focusNext(`section:${sk}:${item.id}`),
    onArrowUp: () => focus.focusPrev(`section:${sk}:${item.id}`),
    onAltD:              () => actions.duplicateItem({ type: 'section', sk, itemId: item.id }),
    onAltArrowUp:        () => actions.moveUp({ type: 'section', sk, itemId: item.id }),
    onAltArrowDown:      () => actions.moveDown({ type: 'section', sk, itemId: item.id }),
    onAltShiftArrowUp:   () => { actions.reorderUp({ type: 'section', sk, itemId: item.id }); focus.focus(`section:${sk}:${item.id}`) },
    onAltShiftArrowDown: () => { actions.reorderDown({ type: 'section', sk, itemId: item.id }); focus.focus(`section:${sk}:${item.id}`) },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
    >
      <BulletRow
        inputRef={focus.reg(`section:${sk}:${item.id}`) as React.RefCallback<HTMLInputElement>}
        text={item.text}
        placeholder={placeholder}
        marker="task"
        onUpdate={text => actions.updateSectionItem(sk, item.id, text)}
        onKeyDown={onKeyDown}
        onBlur={onNormalize}
        onRemove={() => actions.removeSectionItem(sk, item.id)}
        removeAriaLabel="Remove"
        dragAttributes={attributes}
        dragListeners={listeners}
        className={cn(item.meetingKey && 'border-l-2 border-primary')}
      />
    </div>
  )
})

// ── SimpleSection ─────────────────────────────────────────────────────────────

interface SimpleSectionProps {
  sk: SectionKey
  section: EodSimpleSection
  placeholder: string
}

export const SimpleSection = memo(function SimpleSection({
  sk, section, placeholder,
}: SimpleSectionProps) {
  const { mode, actions, focus } = useEodApi()
  const { activeId } = useEodDndState()
  const anyItemDragging = activeId !== null
  const { setNodeRef, isOver } = useDroppable({ id: `section:${sk}` })

  if (section.isNA) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          'flex items-center gap-3 rounded transition-all',
          isOver
            ? 'min-h-10 bg-muted/20 px-2'
            : anyItemDragging
              ? 'min-h-10 border border-dashed border-border/60 px-2'
              : 'min-h-8',
        )}
      >
        <Button
          variant="outline"
          size="xs"
          ref={focus.reg(`na:${sk}`) as React.RefCallback<HTMLButtonElement>}
          className="text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => actions.addSectionItem(sk, null)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); focus.focusNext(`na:${sk}`) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); focus.focusPrev(`na:${sk}`) }
          }}
        >
          N/A
        </Button>
        {mode !== 'zen' && (
          <span className="text-xs text-muted-foreground/40">
            {isOver || anyItemDragging ? 'Drop to add' : 'Click to edit'}
          </span>
        )}
      </div>
    )
  }

  const lastItemId = section.items[section.items.length - 1]?.id ?? null
  const hasMeetingItems = section.items.some(i => i.meetingKey)

  return (
    <div ref={setNodeRef}>
      <SortableContext items={section.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        {section.items.map(item => (
          <SortableSectionItem key={item.id} sk={sk} item={item} placeholder={placeholder} />
        ))}
      </SortableContext>
      {mode !== 'zen' && (
        <div
          className={cn(
            'flex items-center gap-2',
            mode === 'comfortable'
              ? 'pt-1'
              : 'h-7 opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100 transition-opacity duration-150',
          )}
        >
          <Button
            variant="outline"
            size="xs"
            tabIndex={-1}
            onClick={() => actions.addSectionItem(sk, lastItemId)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            + Add item
          </Button>
          {!hasMeetingItems && (
            <Button
              variant="outline"
              size="xs"
              tabIndex={-1}
              onClick={() => actions.setSectionNA(sk)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Set N/A
            </Button>
          )}
        </div>
      )}
    </div>
  )
})
