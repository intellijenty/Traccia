import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Copy, Plus, RotateCcw, Settings2, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { makeId } from '@/lib/eod-types'
import type { EodEmailSettings, EodFormState, EodHistoryEntry } from '@/lib/eod-types'
import type { EodAiDraft, EodAiProjectInfo, EodFactSheet } from '@/lib/eod-ai-types'
import {
  activeFilterPaths,
  loadEodAiSettings,
  saveEodAiSettings,
} from '@/lib/eod-ai-settings'
import type { EodAiSettings } from '@/lib/eod-ai-settings'
import { buildEodHtml, buildEodPlainText } from '@/lib/eod-utils'
import { filterMeetings } from '@/lib/eod-meeting-sync'

interface EodAiDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  history: Record<string, EodHistoryEntry>
  emailSettings: EodEmailSettings
}

type Status = 'idle' | 'running' | 'done' | 'error'
type View = 'main' | 'settings'
type RunMode = 'generate' | 'refine'

const STEPS = [
  { key: 'sessions', label: 'Reading your Claude sessions' },
  { key: 'jira', label: 'Cross-referencing Jira' },
  { key: 'bitbucket', label: 'Checking Bitbucket' },
  { key: 'write', label: 'Writing your EOD' },
] as const

function stepIndexForPhase(phase: string): number {
  switch (phase) {
    case 'sessions': return 0
    case 'gather':
    case 'jira': return 1
    case 'bitbucket': return 2
    case 'write': return 3
    default: return 0
  }
}

function basename(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}

function sectionToState(s: EodAiDraft['otherTasks']): EodFormState['otherTasks'] {
  return { items: s.items.map(i => ({ id: makeId(), text: i.text })), isNA: s.isNA }
}

function draftToFormState(draft: EodAiDraft): EodFormState {
  return {
    date: new Date().toLocaleDateString('en-CA'),
    projects: draft.projects.map(p => ({
      id: makeId(),
      name: p.name,
      status: p.status,
      statusNote: p.statusNote,
      tasksCompleted: p.tasksCompleted.map(t => ({
        id: makeId(),
        text: t.text,
        subBullets: t.subBullets.map(s => ({ id: makeId(), text: s.text })),
      })),
    })),
    otherTasks: sectionToState(draft.otherTasks),
    concerns: sectionToState(draft.concerns),
    nextDayPlan: sectionToState(draft.nextDayPlan),
    upcomingHolidays: sectionToState(draft.upcomingHolidays),
  }
}

export function EodAiDialog({ open, onOpenChange, history, emailSettings }: EodAiDialogProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [view, setView] = useState<View>('main')
  const [runMode, setRunMode] = useState<RunMode>('generate')
  const [stepIdx, setStepIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<EodFormState | null>(null)
  const [rawDraft, setRawDraft] = useState<EodAiDraft | null>(null)
  const [factSheet, setFactSheet] = useState<EodFactSheet | null>(null)
  const [dropped, setDropped] = useState<string[]>([])
  const [error, setError] = useState<{ message: string; code: string; raw?: string } | null>(null)
  const [availability, setAvailability] = useState<{ checked: boolean; available: boolean; error?: string }>({
    checked: false,
    available: false,
  })
  const [notes, setNotes] = useState('')
  const [aiSettings, setAiSettings] = useState<EodAiSettings>(loadEodAiSettings)
  const [projects, setProjects] = useState<EodAiProjectInfo[]>([])
  const [showEvidence, setShowEvidence] = useState(false)
  const [refineText, setRefineText] = useState('')
  const [lastRefine, setLastRefine] = useState<string | null>(null)

  const requestIdRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)
  const statusRef = useRef<Status>('idle')
  statusRef.current = status

  function updateAiSettings(next: EodAiSettings) {
    setAiSettings(next)
    saveEodAiSettings(next)
  }

  // Availability check + project discovery when the dialog opens
  useEffect(() => {
    if (!open) return
    let stale = false
    if (!availability.checked) {
      window.electronAPI
        .aiAvailable()
        .then(res => { if (!stale) setAvailability({ checked: true, available: res.available, error: res.error }) })
        .catch(err => { if (!stale) setAvailability({ checked: true, available: false, error: String(err) }) })
    }
    window.electronAPI
      .eodAiListProjects()
      .then(list => { if (!stale) setProjects(list) })
      .catch(() => { /* checklist stays empty */ })
    return () => { stale = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Push-event subscriptions — registered once, filtered by current requestId
  useEffect(() => {
    const isCurrent = (id: string) => id === requestIdRef.current && !cancelledRef.current
    const offPhase = window.electronAPI.onEodAiPhase(data => {
      if (!isCurrent(data.requestId)) return
      setStepIdx(prev => Math.max(prev, stepIndexForPhase(data.phase)))
    })
    const offDone = window.electronAPI.onEodAiDone(data => {
      if (!isCurrent(data.requestId)) return
      requestIdRef.current = null
      setRawDraft(data.draft)
      setResult(draftToFormState(data.draft))
      setFactSheet(data.factSheet)
      setDropped(Array.isArray(data.dropped) ? data.dropped : [])
      setStatus('done')
    })
    const offError = window.electronAPI.onEodAiError(data => {
      if (!isCurrent(data.requestId)) return
      requestIdRef.current = null
      setError({ message: data.error, code: data.code, raw: data.raw })
      setStatus('error')
    })
    return () => { offPhase(); offDone(); offError() }
  }, [])

  // Elapsed timer while running (elapsed is reset when a run starts)
  useEffect(() => {
    if (status !== 'running') return
    const start = Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(t)
  }, [status])

  // Cancel any in-flight run when the component unmounts
  useEffect(() => () => { cancelCurrentRun() }, [])

  function cancelCurrentRun() {
    if (requestIdRef.current && statusRef.current === 'running') {
      cancelledRef.current = true
      window.electronAPI.aiCancel(requestIdRef.current)
      requestIdRef.current = null
    }
  }

  function beginRun(mode: RunMode) {
    cancelledRef.current = false
    setRunMode(mode)
    setStatus('running')
    setStepIdx(mode === 'refine' ? 3 : 0)
    setElapsed(0)
    setError(null)
    setShowEvidence(false)
    setLastRefine(null)
  }

  async function startGeneration() {
    beginRun('generate')
    setResult(null)
    setRawDraft(null)
    setFactSheet(null)
    setDropped([])

    let meetings: Array<{ title: string; durationMin: number }> = []
    try {
      const res = await window.electronAPI.eodGetMeetingsToday()
      if (res.ok) {
        meetings = filterMeetings(res.meetings).map(m => ({ title: m.title.trim(), durationMin: m.duration }))
      }
    } catch { /* meetings are optional evidence */ }

    const pastEods = Object.values(history)
      .filter(e => typeof e.plainText === 'string' && e.plainText.trim().length > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5)
      .map(e => ({ date: e.date, plainText: e.plainText }))

    try {
      const { requestId } = await window.electronAPI.eodAiGenerate({
        pastEods,
        meetings,
        notes,
        filterMode: aiSettings.filterMode,
        filterPaths: activeFilterPaths(aiSettings),
        instructions: aiSettings.instructions,
      })
      if (cancelledRef.current) {
        window.electronAPI.aiCancel(requestId)
        return
      }
      requestIdRef.current = requestId
    } catch (err) {
      setError({ message: String(err instanceof Error ? err.message : err), code: 'unknown' })
      setStatus('error')
    }
  }

  async function startRefine() {
    const instruction = refineText.trim()
    if (!instruction || !factSheet || !rawDraft) return
    beginRun('refine')
    try {
      const { requestId } = await window.electronAPI.eodAiRefine({
        factSheet,
        previousDraft: rawDraft,
        instruction,
        instructions: aiSettings.instructions,
      })
      if (cancelledRef.current) {
        window.electronAPI.aiCancel(requestId)
        return
      }
      requestIdRef.current = requestId
      setLastRefine(instruction)
      setRefineText('')
    } catch (err) {
      setError({ message: String(err instanceof Error ? err.message : err), code: 'unknown' })
      setStatus('error')
    }
  }

  function promoteLastRefine() {
    if (!lastRefine) return
    const next = {
      ...aiSettings,
      instructions: (aiSettings.instructions.trimEnd() + `\n- ${lastRefine}`).trim(),
    }
    updateAiSettings(next)
    setLastRefine(null)
    toast.success('Added to your standing EOD instructions')
  }

  function toggleProject(path: string) {
    const key = aiSettings.filterMode === 'allowlist' ? 'includedPaths' : 'excludedPaths'
    const list = aiSettings[key]
    const next = list.includes(path) ? list.filter(p => p !== path) : [...list, path]
    updateAiSettings({ ...aiSettings, [key]: next })
  }

  function handleCancel() {
    cancelCurrentRun()
    setLastRefine(null) // a cancelled refine was not applied
    // Fall back to the previous draft if one exists
    setStatus(result ? 'done' : 'idle')
  }

  function handleClose() {
    cancelCurrentRun()
    setView('main')
    onOpenChange(false)
  }

  async function handleCopy() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(buildEodPlainText(result, emailSettings))
      toast.success('EOD copied to clipboard')
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  const pastEodCount = Object.values(history).filter(
    e => typeof e.plainText === 'string' && e.plainText.trim().length > 0,
  ).length

  const activePaths = activeFilterPaths(aiSettings)

  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) handleClose() }}>
      <DialogContent
        showCloseButton={false}
        className="flex w-full md:max-w-4xl flex-col gap-0 overflow-hidden p-0"
        style={{ height: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div className="space-y-1 min-w-0 pr-4">
            <DialogTitle className="flex items-center gap-2 text-base font-medium leading-tight">
              {view === 'settings' ? (
                <>
                  <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Personalize AI EOD
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  AI Generated EOD
                </>
              )}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {view === 'settings'
                ? 'Project filter and standing instructions — saved automatically.'
                : status === 'running'
                  ? `${runMode === 'refine' ? 'Refining' : 'Generating'}… ${elapsed}s`
                  : status === 'done'
                    ? 'Review the draft, tweak it below, or copy it where you need it.'
                    : 'Reconstructs your day from Claude sessions, git, Jira and Bitbucket.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {status !== 'running' && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setView(v => (v === 'main' ? 'settings' : 'main'))}
                aria-label={view === 'settings' ? 'Back' : 'Personalize'}
                className="text-muted-foreground hover:text-foreground"
              >
                {view === 'settings'
                  ? <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  : <Settings2 className="h-4 w-4" aria-hidden="true" />}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleClose}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden bg-muted/40 p-3">
          {view === 'settings' ? (
            <div className="no-scrollbar h-full space-y-5 overflow-y-auto rounded-md border border-border bg-background p-5">
              {/* Filter mode */}
              <div className="space-y-2">
                <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Project filter</p>
                <div className="flex gap-2">
                  {([
                    { mode: 'blocklist', label: 'Report all, except…' },
                    { mode: 'allowlist', label: 'Only report selected' },
                  ] as const).map(opt => (
                    <button
                      key={opt.mode}
                      type="button"
                      onClick={() => updateAiSettings({ ...aiSettings, filterMode: opt.mode })}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-sm transition-colors',
                        aiSettings.filterMode === opt.mode
                          ? 'border-foreground/30 bg-muted font-medium text-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {aiSettings.filterMode === 'blocklist'
                    ? 'Checked projects are hidden from your EOD. New projects are included by default.'
                    : 'Only checked projects appear in your EOD. New projects stay hidden until you check them (fail-safe).'}
                </p>
              </div>

              {/* Project checklist */}
              <div className="space-y-1.5">
                {projects.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    Projects appear here once Traccia sees your Claude sessions.
                  </p>
                ) : (
                  <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border p-1.5">
                    {projects.map(p => {
                      const checked = activePaths.includes(p.path)
                      return (
                        <label
                          key={p.path}
                          className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 hover:bg-muted/60"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProject(p.path)}
                            className="h-3.5 w-3.5 accent-foreground"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">{basename(p.path)}</span>
                            <span className="block truncate text-xs text-muted-foreground">{p.path}</span>
                          </span>
                          {p.sessionsToday > 0 && (
                            <span className="shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                              today
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Instructions doc */}
              <div className="space-y-2">
                <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">EOD instructions</p>
                <textarea
                  value={aiSettings.instructions}
                  onChange={e => updateAiSettings({ ...aiSettings, instructions: e.target.value })}
                  rows={7}
                  spellCheck={false}
                  placeholder={'Standing rules, in your own words. Examples:\n- Keep sub-bullets short and non-technical\n- Always include ATON-5555 - regression testing as WIP with one simple bullet\n- Never say Done unless the PR is merged'}
                  className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  Applied every day. Ticket keys you declare here are trusted as real work.
                </p>
              </div>
            </div>
          ) : status === 'idle' ? (
            <div className="flex h-full flex-col items-center justify-center gap-5 rounded-md border border-border bg-background p-8">
              <Sparkles className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <div className="max-w-md space-y-2 text-center">
                <p className="text-sm text-foreground">
                  One click. Claude reads today&apos;s work evidence and writes your EOD in your own style.
                </p>
                <p className="text-xs text-muted-foreground">
                  Sources: Claude Code sessions · Git activity · Jira · Bitbucket · Meetings
                  {pastEodCount > 0
                    ? ` · Style learned from your last ${pastEodCount} EOD${pastEodCount > 1 ? 's' : ''}`
                    : ' · No past EODs found — a default style will be used'}
                </p>
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                spellCheck={false}
                placeholder={'Anything to add about today? (optional)\ne.g. "Also tested payment flow with Ramesh — include as Done" or "Skip the 1:1 meeting"'}
                className="w-full max-w-md resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {availability.checked && !availability.available && (
                <p className="max-w-md text-xs text-destructive">
                  Claude Code is not available: {availability.error ?? 'unknown error'}
                </p>
              )}
              <Button
                type="button"
                onClick={() => void startGeneration()}
                disabled={!availability.checked || !availability.available}
                className="gap-2"
              >
                {!availability.checked ? <Spinner className="size-4" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                Generate
              </Button>
            </div>
          ) : status === 'running' ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 rounded-md border border-border bg-background p-8">
              {runMode === 'refine' ? (
                <div className="flex items-center gap-3">
                  <Spinner className="size-4" />
                  <span className="text-sm font-medium text-foreground">Rewriting your EOD</span>
                </div>
              ) : (
                <div className="w-full max-w-sm space-y-3">
                  {STEPS.map((step, i) => (
                    <div key={step.key} className="flex items-center gap-3">
                      <span className="flex h-5 w-5 items-center justify-center">
                        {i < stepIdx ? (
                          <Check className="h-4 w-4 text-green-500" aria-hidden="true" />
                        ) : i === stepIdx ? (
                          <Spinner className="size-4" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-border" />
                        )}
                      </span>
                      <span
                        className={cn(
                          'text-sm',
                          i < stepIdx ? 'text-muted-foreground line-through decoration-border'
                            : i === stepIdx ? 'text-foreground font-medium'
                              : 'text-muted-foreground',
                        )}
                      >
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {runMode === 'refine' ? 'Usually under 40 seconds' : 'Usually takes 1–3 minutes'} · {elapsed}s elapsed
              </p>
            </div>
          ) : status === 'done' && result ? (
            <div className="flex h-full flex-col gap-2">
              {dropped.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                  {dropped.length} task{dropped.length > 1 ? 's' : ''} removed — no evidence found for:{' '}
                  {dropped.join(' · ')}
                </div>
              )}
              {lastRefine && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2">
                  <p className="min-w-0 truncate text-xs text-muted-foreground">
                    Applied: &ldquo;{lastRefine}&rdquo;
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={promoteLastRefine}
                    className="shrink-0 gap-1"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    Make this a standing rule
                  </Button>
                </div>
              )}
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setShowEvidence(s => !s)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {showEvidence ? 'Show draft' : 'Show evidence'}
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-white shadow-sm">
                {showEvidence && factSheet ? (
                  <div className="no-scrollbar h-full space-y-4 overflow-y-auto bg-background p-4">
                    {factSheet.tickets.map(t => (
                      <div key={t.key} className="space-y-1.5">
                        <p className="text-sm font-medium text-foreground">
                          {t.key} - {t.title}{' '}
                          <span className={cn(
                            'ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
                            t.statusSignal === 'done'
                              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                          )}>
                            {t.statusSignal}
                          </span>
                        </p>
                        {t.statusEvidence && (
                          <p className="text-xs text-muted-foreground">Status: {t.statusEvidence}</p>
                        )}
                        <ul className="space-y-1 pl-4">
                          {t.actions.map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                              <span className="mt-0.5 shrink-0 rounded border border-border px-1 py-px text-[9px] uppercase text-muted-foreground">
                                {a.source}
                              </span>
                              <span>{a.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {factSheet.meetings.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Meetings: {factSheet.meetings.join(' · ')}
                      </p>
                    )}
                    {factSheet.unmatchedWork.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Unmatched work: {factSheet.unmatchedWork.join(' · ')}
                      </p>
                    )}
                  </div>
                ) : (
                  <iframe
                    srcDoc={buildEodHtml(result, emailSettings)}
                    className="h-full w-full border-0"
                    sandbox="allow-same-origin"
                    title="Generated EOD preview"
                  />
                )}
              </div>
              {/* Refine bar */}
              <div className="flex items-center gap-2">
                <input
                  value={refineText}
                  onChange={e => setRefineText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void startRefine() }}
                  spellCheck={false}
                  placeholder='Tweak it: e.g. "make the second bullet vaguer" or "drop the meeting"'
                  className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!refineText.trim()}
                  onClick={() => void startRefine()}
                >
                  Apply
                </Button>
              </div>
            </div>
          ) : status === 'error' && error ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 rounded-md border border-border bg-background p-8">
              <div className="max-w-lg space-y-2 text-center">
                <p className="text-sm font-medium text-foreground">Generation failed</p>
                <p className="text-sm text-muted-foreground">{error.message}</p>
                <p className="text-xs text-muted-foreground">({error.code})</p>
              </div>
              {error.raw && (
                <pre className="max-h-64 w-full max-w-lg overflow-auto rounded-md border border-border bg-muted/40 p-3 text-left text-xs whitespace-pre-wrap">
                  {error.raw}
                </pre>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          {view === 'settings' ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setView('main')}>
              Done
            </Button>
          ) : status === 'running' ? (
            <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={handleClose}>
              Close
            </Button>
          )}
          {view === 'main' && (status === 'done' || status === 'error') && (
            <Button type="button" variant="outline" size="sm" onClick={() => void startGeneration()} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {status === 'error' ? 'Retry' : 'Regenerate'}
            </Button>
          )}
          {view === 'main' && status === 'done' && result && (
            <Button type="button" size="sm" onClick={() => void handleCopy()} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Copy
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
