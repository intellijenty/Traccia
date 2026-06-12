import { useEffect, useRef, useState } from 'react'
import { Check, Copy, RotateCcw, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { makeId } from '@/lib/eod-types'
import type { EodEmailSettings, EodFormState, EodHistoryEntry } from '@/lib/eod-types'
import type { EodAiDraft } from '@/lib/eod-ai-types'
import { buildEodHtml, buildEodPlainText } from '@/lib/eod-utils'
import { filterMeetings } from '@/lib/eod-meeting-sync'

interface EodAiDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  history: Record<string, EodHistoryEntry>
  emailSettings: EodEmailSettings
}

type Status = 'idle' | 'running' | 'done' | 'error'

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
  const [stepIdx, setStepIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<EodFormState | null>(null)
  const [dropped, setDropped] = useState<string[]>([])
  const [error, setError] = useState<{ message: string; code: string; raw?: string } | null>(null)
  const [availability, setAvailability] = useState<{ checked: boolean; available: boolean; error?: string }>({
    checked: false,
    available: false,
  })

  const requestIdRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)
  const statusRef = useRef<Status>('idle')
  statusRef.current = status

  // Availability check when the dialog opens
  useEffect(() => {
    if (!open || availability.checked) return
    let stale = false
    window.electronAPI
      .aiAvailable()
      .then(res => { if (!stale) setAvailability({ checked: true, available: res.available, error: res.error }) })
      .catch(err => { if (!stale) setAvailability({ checked: true, available: false, error: String(err) }) })
    return () => { stale = true }
  }, [open, availability.checked])

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
      setResult(draftToFormState(data.draft as EodAiDraft))
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

  // Elapsed timer while running (elapsed is reset in startGeneration)
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

  async function startGeneration() {
    cancelledRef.current = false
    setStatus('running')
    setStepIdx(0)
    setElapsed(0)
    setError(null)
    setResult(null)
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
      const { requestId } = await window.electronAPI.eodAiGenerate({ pastEods, meetings })
      if (cancelledRef.current) {
        // user closed/cancelled while the invoke was in flight
        window.electronAPI.aiCancel(requestId)
        return
      }
      requestIdRef.current = requestId
    } catch (err) {
      setError({ message: String(err instanceof Error ? err.message : err), code: 'unknown' })
      setStatus('error')
    }
  }

  function handleCancel() {
    cancelCurrentRun()
    setStatus('idle')
  }

  function handleClose() {
    cancelCurrentRun()
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
              <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              AI Generated EOD
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {status === 'running'
                ? `Generating… ${elapsed}s`
                : status === 'done'
                  ? 'Review the draft below, then copy it where you need it.'
                  : 'Reconstructs your day from Claude sessions, git, Jira and Bitbucket.'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleClose}
            aria-label="Close"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden bg-muted/40 p-3">
          {status === 'idle' && (
            <div className="flex h-full flex-col items-center justify-center gap-5 rounded-md border border-border bg-background p-8 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <div className="max-w-md space-y-2">
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
          )}

          {status === 'running' && (
            <div className="flex h-full flex-col items-center justify-center gap-6 rounded-md border border-border bg-background p-8">
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
              <p className="text-xs text-muted-foreground">
                Usually takes 1–3 minutes · {elapsed}s elapsed
              </p>
            </div>
          )}

          {status === 'done' && result && (
            <div className="flex h-full flex-col gap-2">
              {dropped.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                  {dropped.length} task{dropped.length > 1 ? 's' : ''} removed — no evidence found for:{' '}
                  {dropped.join(' · ')}
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-white shadow-sm">
                <iframe
                  srcDoc={buildEodHtml(result, emailSettings)}
                  className="h-full w-full border-0"
                  sandbox="allow-same-origin"
                  title="Generated EOD preview"
                />
              </div>
            </div>
          )}

          {status === 'error' && error && (
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
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          {status === 'running' ? (
            <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={handleClose}>
              Close
            </Button>
          )}
          {(status === 'done' || status === 'error') && (
            <Button type="button" variant="outline" size="sm" onClick={() => void startGeneration()} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {status === 'error' ? 'Retry' : 'Regenerate'}
            </Button>
          )}
          {status === 'done' && result && (
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
