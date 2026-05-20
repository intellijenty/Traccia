import { Fragment, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { EodFormState, ProjectStatus } from '@/lib/eod-types'
import { Button } from '../ui/button'
import { Kbd, KbdGroup } from '../ui/kbd'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import {
  DndContext, DragOverlay,
  MouseSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, useDroppable,
  type DragEndEvent, type DragStartEvent, type DragMoveEvent,
} from '@dnd-kit/core'
import { restrictToWindowEdges } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { GripVertical } from 'lucide-react'

import type { FormLayoutMode, SectionKey } from './eod-dnd'
import {
  SECTION_KEYS, customCollision, computeProjectedDepth,
  removeFromSource, insertIntoDest, reorderWithinContainer,
  type ItemMeta,
} from './eod-dnd'
import { SortableTaskCard, SimpleSection } from './eod-items'
import { EodFormProvider, useEodApi } from './eod-form-context'

export type { FormLayoutMode } from './eod-dnd'

interface FormEditorProps {
  value: EodFormState
  onChange: (v: EodFormState) => void
  mode?: FormLayoutMode
}

// ── Static config ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { status: ProjectStatus; color: string; label: string }[] = [
  { status: 'green',  color: '#00FF00', label: 'Green'  },
  { status: 'yellow', color: '#FFFF00', label: 'Yellow' },
  { status: 'red',    color: '#FF0000', label: 'Red'    },
  { status: 'none',   color: '',        label: 'None'   },
]

const STATUS_COLOR: Record<ProjectStatus, string> = {
  green: '#00FF00', yellow: '#FFFF00', red: '#FF0000', none: '',
}

const SECTION_CONFIG: { sk: SectionKey; title: string; placeholder: string }[] = [
  { sk: 'otherTasks',       title: 'Other (non-project) Tasks', placeholder: 'Non-project task' },
  { sk: 'concerns',         title: 'Concerns',                  placeholder: 'Blocker or concern' },
  { sk: 'nextDayPlan',      title: 'Plan for Next Day',         placeholder: "Tomorrow's plan" },
  { sk: 'upcomingHolidays', title: 'Upcoming Holidays',         placeholder: 'Planned leave or holiday' },
]

const TASK_SHORTCUTS: { keys: React.ReactNode[]; label: string }[] = [
  { keys: [<Kbd key="e">Enter</Kbd>],                                    label: 'new item' },
  { keys: [<Kbd key="t">Tab</Kbd>],                                      label: 'indent' },
  { keys: [<Kbd key="s">Shift</Kbd>, <Kbd key="t">Tab</Kbd>],            label: 'unindent' },
  { keys: [<Kbd key="u">↑</Kbd>, <Kbd key="d">↓</Kbd>],                  label: 'navigate' },
  { keys: [<Kbd key="s">Shift</Kbd>, <Kbd key="del">Del</Kbd>],          label: 'delete item' },
]

// ── FormEditor ────────────────────────────────────────────────────────────────
// Top-level: owns DnD state (sensors, active id, drag projection) and wires the
// DnD context. State + actions live in EodFormProvider.

export function FormEditor({ value, onChange, mode = 'comfortable' }: FormEditorProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [projectedDepth, setProjectedDepth] = useState<0 | 1>(0)
  const projectedDepthRef = useRef<0 | 1>(0)
  const dragDeltaXRef = useRef(0)

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor),
  )

  function findItemMeta(id: string): ItemMeta | null {
    for (const task of value.tasksCompleted) {
      if (task.id === id) {
        return { type: 'task', container: 'tasks', taskId: task.id, text: task.text }
      }
      for (const sub of task.subBullets) {
        if (sub.id === id) {
          return {
            type: 'sub', container: `subs:${task.id}`,
            taskId: task.id, subId: sub.id, text: sub.text,
          }
        }
      }
    }
    for (const sk of SECTION_KEYS) {
      for (const item of value[sk].items) {
        if (item.id === id) {
          return {
            type: 'section-item', container: `section:${sk}`,
            sk, itemId: item.id, text: item.text,
          }
        }
      }
    }
    return null
  }

  function resolveDestContainer(overId: string): string {
    if (overId === 'tasks' || overId.startsWith('subs:') || overId.startsWith('section:')) {
      return overId
    }
    return findItemMeta(overId)?.container ?? 'tasks'
  }

  function handleDragStart({ active }: DragStartEvent) {
    const id = String(active.id)
    setActiveId(id)
    dragDeltaXRef.current = 0
    const initDepth: 0 | 1 = findItemMeta(id)?.type === 'sub' ? 1 : 0
    projectedDepthRef.current = initDepth
    setProjectedDepth(initDepth)
  }

  function handleDragMove({ active, delta }: DragMoveEvent) {
    dragDeltaXRef.current = delta.x
    const src = findItemMeta(String(active.id))
    if (!src) return
    const next = computeProjectedDepth(src, delta.x)
    if (next !== projectedDepthRef.current) {
      projectedDepthRef.current = next
      setProjectedDepth(next)
    }
  }

  function resetDragState() {
    setActiveId(null)
    dragDeltaXRef.current = 0
    projectedDepthRef.current = 0
    setProjectedDepth(0)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const savedDepth = projectedDepthRef.current
    resetDragState()
    if (!over) return

    const activeIdStr = String(active.id)
    const overId = String(over.id)
    if (activeIdStr === overId) return

    const src = findItemMeta(activeIdStr)
    if (!src) return

    let dstContainer = resolveDestContainer(overId)

    // Horizontal drag intent overrides container.
    if (savedDepth === 0 && src.type === 'sub') {
      dstContainer = 'tasks'
    } else if (savedDepth === 1 && src.type !== 'sub') {
      const overMeta = findItemMeta(overId)
      if (overMeta?.type === 'task' || overMeta?.type === 'sub') {
        dstContainer = `subs:${overMeta.taskId}`
      } else if (dstContainer === 'tasks') {
        const last = value.tasksCompleted[value.tasksCompleted.length - 1]
        if (last) dstContainer = `subs:${last.id}`
      }
    }

    if (src.type === 'task' && dstContainer === `subs:${src.taskId}`) return

    if (src.container === dstContainer) {
      if (overId === dstContainer) return
      onChange(reorderWithinContainer(src, overId, value))
    } else {
      onChange(insertIntoDest(dstContainer, overId, src.text, removeFromSource(src, value)))
    }
  }

  function renderOverlay() {
    if (!activeId) return null
    const meta = findItemMeta(activeId)
    if (!meta) return null
    const marker = projectedDepth === 1 ? '○' : '●'
    const depthChanged = projectedDepth !== (meta.type === 'sub' ? 1 : 0)
    return (
      <div
        style={{ paddingLeft: projectedDepth * 24 }}
        className="transition-[padding-left] duration-75"
      >
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-lg border bg-background px-4 py-1.5 shadow-xl text-[15px] text-foreground opacity-95 cursor-grabbing',
            depthChanged ? 'border-primary/50' : 'border-border',
          )}
        >
          <GripVertical className="size-3.5 text-muted-foreground" />
          <span className="shrink-0 select-none text-foreground/50 text-xs">{marker}</span>
          <span className="min-w-0 truncate flex-1">
            {meta.text || (
              <span className="text-muted-foreground/40">
                {projectedDepth === 1 ? 'Task detail' : 'Item'}
              </span>
            )}
          </span>
          {depthChanged && (
            <span className="shrink-0 text-[10px] text-primary/70 font-medium">
              {projectedDepth === 1 ? '→ sub-bullet' : '→ task'}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <EodFormProvider value={value} onChange={onChange} mode={mode} activeId={activeId}>
      <DndContext
        sensors={sensors}
        collisionDetection={customCollision}
        modifiers={[restrictToWindowEdges]}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={resetDragState}
      >
        <DragOverlay>{renderOverlay()}</DragOverlay>

        <div className="space-y-6">
          <ProjectField project={value.project} status={value.projectStatus} tasks={value.tasksCompleted} />
          <TasksSection tasks={value.tasksCompleted} mode={mode} />
          {SECTION_CONFIG.map(({ sk, title, placeholder }) => (
            <div key={sk} className="group/section">
              <SectionHeader>{title}</SectionHeader>
              <SimpleSection sk={sk} section={value[sk]} placeholder={placeholder} />
            </div>
          ))}
        </div>
      </DndContext>
    </EodFormProvider>
  )
}

// ── Internal pieces ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-sidebar-primary">
      {children}
    </p>
  )
}

interface ProjectFieldProps {
  project: string
  status: ProjectStatus
  tasks: EodFormState['tasksCompleted']
}

function ProjectField({ project, status, tasks }: ProjectFieldProps) {
  const { actions, focus } = useEodApi()
  const statusColor = STATUS_COLOR[status]
  return (
    <div className="flex space-x-2 items-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-sidebar-primary">Project</p>
      <div className="flex items-center gap-3 rounded-lg border border-input bg-background px-3 py-0.5 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50">
        {status !== 'none' && (
          <span className="h-3.5 w-1 shrink-0 rounded" style={{ backgroundColor: statusColor }} />
        )}
        <input
          ref={focus.reg('project') as React.RefCallback<HTMLInputElement>}
          type="text"
          value={project}
          onChange={e => actions.setProject(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              focus.focusNext('project')
            } else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
              e.preventDefault()
              if (tasks.length > 0) focus.focus(`task:${tasks[0].id}`)
              else actions.addTaskAfter(null)
            }
          }}
          placeholder="Project name"
          className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
          autoComplete="off"
          name="project"
        />
        <ProjectStatusPicker value={status} onChange={actions.setProjectStatus} />
      </div>
    </div>
  )
}

function ProjectStatusPicker({
  value, onChange,
}: { value: ProjectStatus; onChange: (v: ProjectStatus) => void }) {
  return (
    <div className="flex items-center gap-2">
      {STATUS_OPTIONS.map(o => (
        <Tooltip key={o.status} delayDuration={200}>
          <TooltipTrigger>
            <button
              type="button"
              onClick={() => onChange(o.status)}
              aria-label={o.label}
              className={cn(
                'size-3 rounded-full border transition-all',
                value === o.status
                  ? 'ring-2 ring-offset-1 ring-foreground/30 scale-105'
                  : 'opacity-40 hover:opacity-80',
                o.status === 'none' ? 'border-2 border-primary-foreground' : 'border-transparent',
              )}
              style={o.color ? { backgroundColor: o.color } : undefined}
            />
          </TooltipTrigger>
          <TooltipContent>{o.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

interface TasksSectionProps {
  tasks: EodFormState['tasksCompleted']
  mode: FormLayoutMode
}

function TasksSection({ tasks, mode }: TasksSectionProps) {
  const { actions } = useEodApi()
  const { setNodeRef: setTasksDropRef } = useDroppable({ id: 'tasks' })
  const lastTaskId = tasks[tasks.length - 1]?.id ?? null

  return (
    <div>
      <div className="flex items-center justify-between">
        <SectionHeader>Tasks Completed</SectionHeader>
        {mode !== 'zen' && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pb-3">
            {TASK_SHORTCUTS.map(({ keys, label }, i) => (
              <Fragment key={label}>
                {i > 0 && <span className="text-muted-foreground">&middot;</span>}
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <KbdGroup>{keys}</KbdGroup> {label}
                </span>
              </Fragment>
            ))}
          </div>
        )}
      </div>

      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setTasksDropRef} className="space-y-1">
          {tasks.map(task => (
            <SortableTaskCard key={task.id} task={task} />
          ))}

          {mode !== 'zen' && (
            <div className="flex items-center gap-1">
              <Button
                tabIndex={-1}
                variant="outline"
                size="sm"
                onClick={() => actions.addTaskAfter(lastTaskId)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <HugeiconsIcon icon={PlusSignIcon} className="shrink-0 size-3 mr-1" />
                <span>Add task</span>
              </Button>
              <KbdGroup className="ml-1"><Kbd>Ctrl</Kbd><Kbd>Enter</Kbd></KbdGroup>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}
