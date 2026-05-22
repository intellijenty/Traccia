import { Fragment, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { EodFormState, EodProject, ProjectStatus } from '@/lib/eod-types'
import { Button } from '../ui/button'
import { Kbd, KbdGroup } from '../ui/kbd'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
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
import {
  EodFormProvider, EodProjectContext,
  useEodApi, useEodDndState, useProjectId,
} from './eod-form-context'
import { useUndoHistory } from './use-undo-history'

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
  { keys: [<Kbd key="e">Enter</Kbd>],                                                             label: 'new item' },
  { keys: [<Kbd key="t">Tab</Kbd>],                                                               label: 'indent' },
  { keys: [<Kbd key="u">↑</Kbd>, <Kbd key="d">↓</Kbd>],                                          label: 'navigate' },
  { keys: [<Kbd key="s">Shift</Kbd>, <Kbd key="del">Del</Kbd>],                                  label: 'delete item' },
  { keys: [<Kbd key="a">Alt</Kbd>, <Kbd key="au">↑</Kbd>, <Kbd key="ad">↓</Kbd>],               label: 'move item' },
  { keys: [<Kbd key="altd1">Alt</Kbd>, <Kbd key="altd2">D</Kbd>],                                label: 'duplicate' },
]

// ── FormEditor ────────────────────────────────────────────────────────────────

export function FormEditor({ value, onChange, mode = 'comfortable' }: FormEditorProps) {
  const { historyCommit } = useUndoHistory(value, onChange)

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
    for (const project of value.projects) {
      for (const task of project.tasksCompleted) {
        if (task.id === id) {
          return {
            type: 'task',
            container: `tasks:${project.id}`,
            projectId: project.id,
            taskId: task.id,
            text: task.text,
          }
        }
        for (const sub of task.subBullets) {
          if (sub.id === id) {
            return {
              type: 'sub',
              container: `subs:${task.id}`,
              projectId: project.id,
              taskId: task.id,
              subId: sub.id,
              text: sub.text,
            }
          }
        }
      }
    }
    for (const sk of SECTION_KEYS) {
      for (const item of value[sk].items) {
        if (item.id === id) {
          return {
            type: 'section-item',
            container: `section:${sk}`,
            sk,
            itemId: item.id,
            text: item.text,
          }
        }
      }
    }
    return null
  }

  function resolveDestContainer(overId: string): string {
    if (overId.startsWith('tasks:') || overId.startsWith('subs:') || overId.startsWith('section:')) {
      return overId
    }
    const meta = findItemMeta(overId)
    return meta?.container ?? `tasks:${value.projects[0]?.id ?? ''}`
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
      dstContainer = `tasks:${src.projectId}`
    } else if (savedDepth === 1 && src.type !== 'sub') {
      const overMeta = findItemMeta(overId)
      if (overMeta?.type === 'task' || overMeta?.type === 'sub') {
        dstContainer = `subs:${overMeta.taskId}`
      } else if (dstContainer.startsWith('tasks:')) {
        const projectId = dstContainer.slice(6)
        const project = value.projects.find(p => p.id === projectId)
        const last = project?.tasksCompleted[project.tasksCompleted.length - 1]
        if (last) dstContainer = `subs:${last.id}`
      }
    }

    if (src.type === 'task' && dstContainer === `subs:${src.taskId}`) return

    // Block cross-project drag (guard 1: tasks: container)
    if ((src.type === 'task' || src.type === 'sub') && dstContainer.startsWith('tasks:')) {
      if (dstContainer.slice(6) !== src.projectId) return
    }

    // Block cross-project drag (guard 2: subs: container)
    if ((src.type === 'task' || src.type === 'sub') && dstContainer.startsWith('subs:')) {
      const destTaskMeta = findItemMeta(dstContainer.slice(5))
      if (destTaskMeta && destTaskMeta.projectId !== src.projectId) return
    }

    if (src.container === dstContainer) {
      if (overId === dstContainer) return
      historyCommit(reorderWithinContainer(src, overId, value))
    } else {
      historyCommit(insertIntoDest(dstContainer, overId, src.text, removeFromSource(src, value)))
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
    <EodFormProvider value={value} onChange={historyCommit} mode={mode} activeId={activeId}>
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

        <div className="space-y-4">
          {value.projects.map(project => (
            <EodProjectContext.Provider key={project.id} value={project.id}>
              <ProjectCard project={project} canRemove={value.projects.length > 1} mode={mode} />
            </EodProjectContext.Provider>
          ))}

          {mode !== 'zen' && <AddProjectButton />}

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

function AddProjectButton() {
  const { actions } = useEodApi()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      tabIndex={-1}
      onClick={() => actions.addProject()}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <HugeiconsIcon icon={PlusSignIcon} className="shrink-0 size-3 mr-1" />
      Add Project
    </Button>
  )
}

// ── ProjectCard ───────────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: EodProject
  canRemove: boolean
  mode: FormLayoutMode
}

function ProjectCard({ project, canRemove, mode }: ProjectCardProps) {
  const { actions } = useEodApi()
  return (
    <div className="rounded-xl border border-border/40 bg-muted/5 px-4 pb-4 pt-3 space-y-3.5">
      <div className="flex items-start gap-2">
        <ProjectField project={project} />
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            tabIndex={-1}
            aria-label="Remove project"
            title={`Remove Project "${project.name || ''}"`}
            className="shrink-0 mt-0.5 text-muted-foreground/40 hover:text-destructive transition-colors"
            onClick={() => {
              const hasContent = project.tasksCompleted.some(t => t.text.trim())
              if (hasContent && !window.confirm(`Delete project "${project.name || 'Untitled'}"?`)) return
              actions.removeProject(project.id)
            }}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="shrink-0 size-3" />
          </Button>
        )}
      </div>
      <TasksSection tasks={project.tasksCompleted} mode={mode} />
    </div>
  )
}

// ── ProjectField ──────────────────────────────────────────────────────────────

interface ProjectFieldProps {
  project: EodProject
}

function ProjectField({ project }: ProjectFieldProps) {
  const { actions, focus } = useEodApi()
  const statusColor = STATUS_COLOR[project.status]
  return (
    <div className="flex flex-1 items-center space-x-8">
      {/* Project name row */}
      <div className="flex items-center w-full max-w-sm gap-3">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-sidebar-primary">
          Project
        </span>
        <div className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 py-0.5 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50">
          {project.status !== 'none' && (
            <span className="h-3.5 w-1 shrink-0 rounded" style={{ backgroundColor: statusColor }} />
          )}
          <input
            ref={focus.reg(`project:${project.id}`) as React.RefCallback<HTMLInputElement>}
            type="text"
            value={project.name}
            onChange={e => actions.setProjectName(project.id, e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown' && e.altKey) {
                e.preventDefault()
                actions.reorderProjectDown(project.id)
              } else if (e.key === 'ArrowUp' && e.altKey) {
                e.preventDefault()
                actions.reorderProjectUp(project.id)
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                focus.focusNext(`project:${project.id}`)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                focus.focusPrev(`project:${project.id}`)
              } else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                e.preventDefault()
                if (project.statusNote !== null) {
                  focus.focus(`project-status:${project.id}`)
                } else if (project.tasksCompleted.length > 0) {
                  focus.focus(`task:${project.tasksCompleted[0].id}`)
                } else {
                  actions.addTaskAfter(project.id, null)
                }
              }
            }}
            placeholder="Project name…"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
            autoComplete="off"
            name="project"
          />
          <ProjectStatusPicker
            value={project.status}
            onChange={s => actions.setProjectStatus(project.id, s)}
          />
        </div>
      </div>

      {/* Status note row */}
      <div className="flex items-center gap-3 w-full max-w-lg">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-sidebar-primary">
          Status Text
        </span>
        {project.statusNote === null ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            tabIndex={-1}
            onClick={() => actions.setProjectStatusNote(project.id, '')}
            className="text-muted-foreground/80 hover:text-foreground rounded-md"
          >
            N/A
          </Button>
        ) : (
          <div className="flex flex-1 items-center gap-1 rounded-md border border-input bg-background px-2.5 py-0.5 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50">
            <input
              ref={focus.reg(`project-status:${project.id}`) as React.RefCallback<HTMLInputElement>}
              type="text"
              value={project.statusNote}
              onChange={e => actions.setProjectStatusNote(project.id, e.target.value)}
              onBlur={() => {
                if (!project.statusNote) actions.setProjectStatusNote(project.id, null)
              }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') { e.preventDefault(); focus.focusNext(`project-status:${project.id}`) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); focus.focusPrev(`project-status:${project.id}`) }
                else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                  e.preventDefault()
                  focus.focusNext(`project-status:${project.id}`)
                }
              }}
              placeholder="Reason for status (optional)"
              className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
              autoComplete="off"
              name="project-status"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              tabIndex={-1}
              aria-label="Clear status note"
              onClick={() => actions.setProjectStatusNote(project.id, null)}
              className="shrink-0 hover:text-destructive transition-colors"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-2.5" />
            </Button>
          </div>
        )}
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

// ── TasksSection ──────────────────────────────────────────────────────────────
// Consumes EodProjectContext (set by form-editor's project loop).

interface TasksSectionProps {
  tasks: EodProject['tasksCompleted']
  mode: FormLayoutMode
}

function TasksSection({ tasks, mode }: TasksSectionProps) {
  const { actions, focus } = useEodApi()
  const { activeId } = useEodDndState()
  const anyItemDragging = activeId !== null
  const projectId = useProjectId()
  const { setNodeRef: setTasksDropRef, isOver } = useDroppable({ id: `tasks:${projectId}` })
  const lastTaskId = tasks[tasks.length - 1]?.id ?? null
  const isNA = tasks.length === 0

  return (
    <div>
      <div className="flex items-center justify-between pb-1">
        <SectionHeader>Tasks Completed</SectionHeader>
        {mode !== 'zen' && !isNA && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pb-2">
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

      {isNA ? (
        <div
          ref={setTasksDropRef}
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
            ref={focus.reg(`na:tasks:${projectId}`) as React.RefCallback<HTMLButtonElement>}
            className="text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={() => actions.addTaskAfter(projectId, null)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); focus.focusNext(`na:tasks:${projectId}`) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); focus.focusPrev(`na:tasks:${projectId}`) }
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
      ) : (
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
                  onClick={() => actions.addTaskAfter(projectId, lastTaskId)}
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
      )}
    </div>
  )
}
