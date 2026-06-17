import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check, Copy, Plus, RotateCcw, Settings2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { TiGlyph } from '@/components/ui/ti-glyph'
import type { EodEmailSettings, EodHistoryEntry } from '@/lib/eod-types'
import type { EodAiProjectInfo } from '@/lib/eod-ai-types'
import {
  activeFilterPaths,
  loadEodAiSettings,
  saveEodAiSettings,
} from '@/lib/eod-ai-settings'
import type { EodAiSettings } from '@/lib/eod-ai-settings'
import { buildEodHtml, buildEodPlainText } from '@/lib/eod-utils'
import {
  useEodAiState,
  startGeneration,
  startRefine,
  cancelRun,
  clearLastRefine,
} from '@/lib/eod-ai-store'

interface EodAiDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  history: Record<string, EodHistoryEntry>
  emailSettings: EodEmailSettings
}

type View = 'main' | 'settings'

const STEPS = [
  { key: 'sessions', label: 'Reading your Claude sessions' },
  { key: 'jira', label: 'Cross-referencing Jira' },
  { key: 'bitbucket', label: 'Checking Bitbucket' },
  { key: 'write', label: 'Writing your EOD' },
] as const

function basename(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}

export function EodAiDialog({ open, onOpenChange, history, emailSettings }: EodAiDialogProps) {
  const s = useEodAiState()

  const [view, setView] = useState<View>('main')
  const [notes, setNotes] = useState('')
  const [refineText, setRefineText] = useState('')
  const [showEvidence, setShowEvidence] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [aiSettings, setAiSettings] = useState<EodAiSettings>(loadEodAiSettings)
  const [projects, setProjects] = useState<EodAiProjectInfo[]>([])
  const [availability, setAvailability] = useState<{ checked: boolean; available: boolean; error?: string }>({
    checked: false, available: false,
  })

  const running = s.status === 'running'

  function updateAiSettings(next: EodAiSettings) {
    setAiSettings(next)
    saveEodAiSettings(next)
  }

  // Availability check + project discovery when the panel opens
  useEffect(() => {
    if (!open) return
    let stale = false
    if (!availability.checked) {
      window.electronAPI.aiAvailable()
        .then(res => { if (!stale) setAvailability({ checked: true, available: res.available, error: res.error }) })
        .catch(err => { if (!stale) setAvailability({ checked: true, available: false, error: String(err) }) })
    }
    window.electronAPI.eodAiListProjects()
      .then(list => { if (!stale) setProjects(list) })
      .catch(() => { /* checklist stays empty */ })
    return () => { stale = true }
  }, [open, availability.checked])

  // Elapsed timer derived from the store's startedAt
  useEffect(() => {
    if (!running) return
    const tick = () => setElapsed(s.startedAt ? Math.max(0, Math.floor((Date.now() - s.startedAt) / 1000)) : 0)
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [running, s.startedAt])

  const handleGenerate = useCallback(() => {
    setShowEvidence(false)
    const pastEods = Object.values(history)
      .filter(e => typeof e.plainText === 'string' && e.plainText.trim().length > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5)
      .map(e => ({ date: e.date, plainText: e.plainText }))
    void startGeneration({
      pastEods,
      notes,
      filterMode: aiSettings.filterMode,
      filterPaths: activeFilterPaths(aiSettings),
      instructions: aiSettings.instructions,
    })
  }, [history, notes, aiSettings])

  // Enter triggers Generate from the cold-start state (Linear-style). Ignored
  // while typing in the notes textarea / refine input so Enter stays a newline.
  useEffect(() => {
    if (!open || view !== 'main' || s.status !== 'idle') return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Enter' || e.shiftKey) return
      const el = document.activeElement
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return
      if (!availability.available) return
      e.preventDefault()
      handleGenerate()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, view, s.status, availability.available, handleGenerate])

  function handleRefine() {
    const instruction = refineText.trim()
    if (!instruction) return
    void startRefine(instruction, aiSettings.instructions)
    setRefineText('')
  }

  function promoteLastRefine() {
    if (!s.lastRefine) return
    updateAiSettings({ ...aiSettings, instructions: `${aiSettings.instructions.trimEnd()}\n- ${s.lastRefine}`.trim() })
    clearLastRefine()
    toast.success('Added to your standing EOD instructions')
  }

  function toggleProject(path: string) {
    const key = aiSettings.filterMode === 'allowlist' ? 'includedPaths' : 'excludedPaths'
    const list = aiSettings[key]
    const next = list.includes(path) ? list.filter(p => p !== path) : [...list, path]
    updateAiSettings({ ...aiSettings, [key]: next })
  }

  // Closing the panel does NOT cancel — the run keeps going in the background
  // and is re-attached on reopen. Only the explicit Cancel button stops it.
  function handleClose() {
    setView('main')
    onOpenChange(false)
  }

  // Esc closes the panel (not the app window). The overlay carries
  // role="dialog", so App's close-window shortcut already skips while it's open;
  // this listener does the actual close. Capture + stopPropagation keeps Esc
  // from reaching any other global handler.
  useEffect(() => {
    if (!open) return
    function onEsc(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      handleClose()
    }
    window.addEventListener('keydown', onEsc, true)
    return () => window.removeEventListener('keydown', onEsc, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleCopy() {
    if (!s.result) return
    try {
      await navigator.clipboard.writeText(buildEodPlainText(s.result, emailSettings))
      toast.success('EOD copied to clipboard')
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  const pastEodCount = Object.values(history).filter(
    e => typeof e.plainText === 'string' && e.plainText.trim().length > 0,
  ).length
  const activePaths = activeFilterPaths(aiSettings)
  const showDone = s.status === 'done' && !!s.result

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI Generated EOD"
      className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-background duration-200 animate-in fade-in"
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border px-6 py-4">
        <div className="min-w-0 space-y-0.5 pr-4">
          <h2 className="flex items-center gap-2 text-base font-medium leading-tight">
            {view === 'settings' ? (
              <><Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Personalize</>
            ) : (
              <><TiGlyph size={16} running={running} /> Traccia Intelligence</>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {view === 'settings'
              ? 'Project filter and standing instructions — saved automatically.'
              : running
                ? `${s.runMode === 'refine' ? 'Refining' : 'Generating'}… ${elapsed}s`
                : showDone
                  ? 'Review the draft, tweak it below, or copy it where you need it.'
                  : 'Generate your EOD with AI'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!running && (
            <Button
              type="button" variant="ghost" size="icon-sm"
              onClick={() => setView(v => (v === 'main' ? 'settings' : 'main'))}
              aria-label={view === 'settings' ? 'Back' : 'Personalize'}
              className="text-muted-foreground hover:text-foreground"
            >
              {view === 'settings' ? <ArrowLeft className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
            </Button>
          )}
          <Button
            type="button" variant="ghost" size="icon-sm" onClick={handleClose}
            aria-label="Close" className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-hidden bg-muted/40 p-3">
        {view === 'settings' ? (
          <ScrollArea className="h-full rounded-lg border border-border bg-background">
            <div className="space-y-6 p-5">
              {/* Filter mode */}
              <div className="space-y-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Project filter</p>
                <ToggleGroup
                  type="single"
                  value={aiSettings.filterMode}
                  onValueChange={v => { if (v) updateAiSettings({ ...aiSettings, filterMode: v as EodAiSettings['filterMode'] }) }}
                  className="inline-flex gap-1 rounded-lg border border-border bg-muted/40 p-0.5"
                >
                  <ToggleGroupItem value="blocklist">Only exclude selected</ToggleGroupItem>
                  <ToggleGroupItem value="allowlist">Only include selected</ToggleGroupItem>
                </ToggleGroup>
                <p className="text-xs text-muted-foreground">
                  {aiSettings.filterMode === 'blocklist'
                    ? 'Checked projects are hidden from your EOD. New projects are included by default.'
                    : 'Only checked projects appear in your EOD. New projects stay hidden until checked.'}
                </p>
              </div>

              {/* Project checklist */}
              {projects.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  Projects appear here once Traccia sees your Claude sessions.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <ScrollArea className="[&>[data-radix-scroll-area-viewport]]:max-h-56">
                    <div className="space-y-0.5 p-1.5">
                      {projects.map(p => {
                        const checked = activePaths.includes(p.path)
                        return (
                          <label
                            key={p.path}
                            className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60"
                          >
                            <Checkbox checked={checked} onCheckedChange={() => toggleProject(p.path)} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">{basename(p.path)}</span>
                              <span className="block truncate font-mono text-xs text-muted-foreground">{p.path}</span>
                            </span>
                            {p.sessionsToday > 0 && (
                              <Badge variant="secondary" className="shrink-0 bg-blue-500/10 text-[10px] text-blue-600 dark:text-blue-400">today</Badge>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Instructions doc */}
              <div className="space-y-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">EOD instructions</p>
                <Textarea
                  value={aiSettings.instructions}
                  onChange={e => updateAiSettings({ ...aiSettings, instructions: e.target.value })}
                  rows={7}
                  spellCheck={false}
                  className="resize-none text-sm leading-relaxed"
                  placeholder={'Standing rules, in your own words. Examples:\n- Keep sub-bullets short and non-technical\n- Always include ATON-5555 - regression testing as WIP\n- Never say Done unless the PR is merged'}
                />
                <p className="text-xs text-muted-foreground">
                  Instructions you declare here are applied every day.
                </p>
              </div>
            </div>
          </ScrollArea>
        ) : running ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 rounded-lg border border-border bg-background p-8">
            {s.runMode === 'refine' ? (
              <div className="flex items-center gap-3">
                <Spinner className="size-4" />
                <span className="text-sm font-medium text-foreground">Rewriting your EOD</span>
              </div>
            ) : (
              <div className="w-full max-w-sm space-y-3">
                {STEPS.map((step, i) => (
                  <div key={step.key} className="flex items-center gap-3">
                    <span className="flex size-5 items-center justify-center">
                      {i < s.stepIdx ? (
                        <Check className="size-4 text-emerald-500" aria-hidden="true" />
                      ) : i === s.stepIdx ? (
                        <Spinner className="size-4" />
                      ) : (
                        <span className="size-1.5 rounded-full bg-border" />
                      )}
                    </span>
                    <span className={cn(
                      'text-sm',
                      i < s.stepIdx ? 'text-muted-foreground line-through decoration-border'
                        : i === s.stepIdx ? 'font-medium text-foreground'
                          : 'text-muted-foreground',
                    )}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {s.runMode === 'refine' ? 'Usually under 40 seconds' : 'Usually takes 1–3 minutes'} · {elapsed}s elapsed
            </p>
            <p className="text-[11px] text-muted-foreground/70">You can close this and keep working — it&apos;ll finish in the background.</p>
          </div>
        ) : showDone ? (
          <div className="flex h-full flex-col gap-2">
            {s.dropped.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                {s.dropped.length} task{s.dropped.length > 1 ? 's' : ''} removed — no evidence for: {s.dropped.join(' · ')}
              </div>
            )}
            {s.lastRefine && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <p className="min-w-0 truncate text-xs text-muted-foreground">Applied: &ldquo;{s.lastRefine}&rdquo;</p>
                <Button type="button" variant="outline" size="xs" onClick={promoteLastRefine} className="shrink-0 gap-1">
                  <Plus className="h-3 w-3" aria-hidden="true" /> Make standing rule
                </Button>
              </div>
            )}
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowEvidence(v => !v)}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {showEvidence ? 'Show draft' : 'Show evidence'}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-white shadow-sm">
              {showEvidence && s.factSheet ? (
                <ScrollArea className="h-full bg-background">
                  <div className="space-y-4 p-4">
                    {s.factSheet.tickets.map(t => (
                      <div key={t.key} className="space-y-1.5">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                          <span className="font-mono">{t.key}</span> {t.title}
                          <Badge variant="outline" className={cn(
                            'font-mono text-[10px] uppercase',
                            t.statusSignal === 'done'
                              ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                              : 'border-amber-500/30 text-amber-600 dark:text-amber-400',
                          )}>{t.statusSignal}</Badge>
                        </p>
                        {t.statusEvidence && <p className="text-xs text-muted-foreground">{t.statusEvidence}</p>}
                        <ul className="space-y-1 pl-3">
                          {t.actions.map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                              <Badge variant="secondary" className="shrink-0 text-[9px] uppercase">{a.source}</Badge>
                              <span>{a.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {s.factSheet.meetings.length > 0 && (
                      <p className="text-xs text-muted-foreground">Meetings: {s.factSheet.meetings.join(' · ')}</p>
                    )}
                    {s.factSheet.unmatchedWork.length > 0 && (
                      <p className="text-xs text-muted-foreground">Unmatched: {s.factSheet.unmatchedWork.join(' · ')}</p>
                    )}
                  </div>
                </ScrollArea>
              ) : (
                <iframe
                  srcDoc={buildEodHtml(s.result!, emailSettings)}
                  className="h-full w-full border-0"
                  sandbox="allow-same-origin"
                  title="Generated EOD preview"
                />
              )}
            </div>
            {/* Refine bar */}
            <div className="flex items-center gap-2">
              <Input
                value={refineText}
                onChange={e => setRefineText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRefine() }}
                spellCheck={false}
                placeholder='Tweak it: "make the second bullet vaguer", "drop the meeting"'
                className="h-9 flex-1"
              />
              <Button type="button" variant="outline" size="sm" disabled={!refineText.trim()} onClick={handleRefine}>
                Apply
              </Button>
            </div>
          </div>
        ) : s.status === 'error' && s.error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-lg border border-border bg-background p-8">
            <div className="max-w-lg space-y-1.5 text-center">
              <p className="text-sm font-medium text-foreground">Generation failed</p>
              <p className="text-sm text-muted-foreground">{s.error.message}</p>
              <p className="font-mono text-xs text-muted-foreground">({s.error.code})</p>
            </div>
            {s.error.raw && (
              <ScrollArea className="max-h-64 w-full max-w-lg rounded-lg border border-border bg-muted/40">
                <pre className="p-3 text-left text-xs whitespace-pre-wrap">{s.error.raw}</pre>
              </ScrollArea>
            )}
          </div>
        ) : (
          /* Idle / cold start */
          <div className="flex h-full items-center justify-center rounded-lg border border-border bg-background p-8">
            <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
              <TiGlyph size={44} />
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Reconstruct today&apos;s EOD with Traccia Intelligence
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Traccia reads your work evidence and writes the draft in your own style.
                  <br />
                  Claude sessions · Git · Jira · Bitbucket · Meetings
                  {pastEodCount > 0 ? ` · style from your last ${pastEodCount} EOD${pastEodCount > 1 ? 's' : ''}` : ''}
                </p>
              </div>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                spellCheck={false}
                className="resize-none text-sm leading-relaxed"
                placeholder={'Anything to add about today? (optional)\ne.g. "Also updated services on remote server", "Guided Interns"...'}
              />
              {availability.checked && !availability.available && (
                <p className="text-xs text-destructive">Claude Code is not available: {availability.error ?? 'unknown error'}</p>
              )}
              <Button
                type="button"
                size="lg"
                onClick={handleGenerate}
                disabled={!availability.checked || !availability.available}
                className="min-w-32"
              >
                {!availability.checked ? <Spinner className="size-4" /> : 'Generate'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
        {view === 'settings' ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setView('main')}>Done</Button>
        ) : running ? (
          <Button type="button" variant="outline" size="sm" onClick={cancelRun}>Cancel</Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={handleClose}>Close</Button>
        )}
        {view === 'main' && (showDone || s.status === 'error') && (
          <Button type="button" variant="outline" size="sm" onClick={handleGenerate} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {s.status === 'error' ? 'Retry' : 'Regenerate'}
          </Button>
        )}
        {view === 'main' && showDone && (
          <Button type="button" size="sm" onClick={() => void handleCopy()} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy
          </Button>
        )}
      </div>
    </div>
  )
}
