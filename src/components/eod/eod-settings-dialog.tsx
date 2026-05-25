import { useState, useEffect, useRef } from 'react'
import { X, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Mail02Icon, Calendar03Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { migratePlainTextSignature } from '@/lib/eod-utils'
import type { EodEmailSettings } from '@/lib/eod-types'
import { SignatureEditor } from '@/components/eod/signature-editor'
import {
  loadMeetingsSettings, saveMeetingsSettings,
  type EodMeetingsSettings, type MeetingRule, type MeetingRouteTarget,
} from '@/lib/eod-meetings-settings'
import { makeId } from '@/lib/eod-types'

const STORAGE_KEY = 'traccia:eod-settings'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function isValidEmail(e: string) {
  return EMAIL_RE.test(e)
}

export function loadEodSettings(): EodEmailSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Record<string, unknown>
      return {
        to: (p.to as string) || '',
        cc: Array.isArray(p.cc)
          ? (p.cc as string[])
          : typeof p.cc === 'string' && p.cc
          ? [p.cc]
          : [],
        signature: migratePlainTextSignature((p.signature as string) || ''),
        embedSignature: typeof p.embedSignature === 'boolean' ? p.embedSignature : true,
      }
    }
  } catch { /* ignore */ }
  return { to: '', cc: [], signature: '', embedSignature: true }
}

export function saveEodSettings(s: EodEmailSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

const DIALOG_TABS = [
  { value: 'email',    label: 'Email',    icon: Mail02Icon     },
  { value: 'meetings', label: 'Meetings', icon: Calendar03Icon },
] as const

type DialogTab = (typeof DIALOG_TABS)[number]['value']

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: EodEmailSettings
  onSave: (s: EodEmailSettings) => void
}

// ── KeywordChipsInput ─────────────────────────────────────────────────────────

interface KeywordChipsInputProps {
  keywords: string[]
  onChange: (keywords: string[]) => void
}

function KeywordChipsInput({ keywords, onChange }: KeywordChipsInputProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function commit() {
    const trimmed = input.trim().toLowerCase()
    if (!trimmed) return
    if (!keywords.some(k => k.toLowerCase() === trimmed)) {
      onChange([...keywords, trimmed])
    }
    setInput('')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault()
      commit()
    }
    if (e.key === 'Backspace' && input === '' && keywords.length > 0) {
      onChange(keywords.slice(0, -1))
    }
  }

  return (
    <div
      className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 cursor-text focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50"
      onClick={() => inputRef.current?.focus()}
    >
      {keywords.map(kw => (
        <span
          key={kw}
          className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
        >
          {kw}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(keywords.filter(k => k !== kw)) }}
            aria-label={`Remove keyword ${kw}`}
            className="rounded p-0.5 hover:bg-accent outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X className="h-2.5 w-2.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={keywords.length === 0 ? 'Type keyword, press Enter…' : ''}
        className="min-w-20 flex-1 bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground/50"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  )
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function EodSettingsDialog({ open, onOpenChange, settings, onSave }: Props) {
  const [activeTab, setActiveTab] = useState<DialogTab>('email')

  // ── Email tab state ─────────────────────────────────────────────────────────
  const [toInput, setToInput] = useState(settings.to)
  const [ccChips, setCcChips] = useState<string[]>(settings.cc)
  const [ccInput, setCcInput] = useState('')
  const [ccError, setCcError] = useState('')
  const [toError, setToError] = useState('')
  const [signature, setSignature] = useState(settings.signature)
  const [embedSignature, setEmbedSignature] = useState(settings.embedSignature ?? true)
  const ccRef = useRef<HTMLInputElement>(null)

  // ── Meetings tab state ──────────────────────────────────────────────────────
  const [meetingsSettings, setMeetingsSettings] = useState<EodMeetingsSettings>(loadMeetingsSettings)

  useEffect(() => {
    if (open) {
      setToInput(settings.to)
      setCcChips(settings.cc)
      setCcInput('')
      setCcError('')
      setToError('')
      setSignature(settings.signature)
      setEmbedSignature(settings.embedSignature ?? true)
      setMeetingsSettings(loadMeetingsSettings())
    }
  }, [open, settings])

  function tryAddCc(raw: string): boolean {
    setCcError('')
    const parts = raw.split(/[,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
    if (!parts.length) return false
    const invalid = parts.filter(e => !isValidEmail(e))
    if (invalid.length) { setCcError(`Invalid: ${invalid.join(', ')}`); return false }
    const fresh = parts.filter(e => !ccChips.some(c => c.toLowerCase() === e.toLowerCase()))
    if (!fresh.length) { setCcError('Already added'); return false }
    setCcChips(prev => [...prev, ...fresh])
    setCcInput('')
    setTimeout(() => ccRef.current?.focus(), 0)
    return true
  }

  function handleCcKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault()
      tryAddCc(ccInput)
    }
    if (e.key === 'Backspace' && ccInput === '' && ccChips.length > 0) {
      setCcChips(prev => prev.slice(0, -1))
    }
  }

  function handleSave() {
    if (ccInput.trim()) {
      const ok = tryAddCc(ccInput)
      if (!ok) return
    }
    const resolvedTo = toInput.trim().toLowerCase()
    if (resolvedTo && !isValidEmail(resolvedTo)) {
      setToError('Invalid email address')
      return
    }
    setToError('')
    const emailS: EodEmailSettings = { to: resolvedTo, cc: ccChips, signature, embedSignature }
    onSave(emailS)
    saveEodSettings(emailS)
    saveMeetingsSettings(meetingsSettings)
    onOpenChange(false)
  }

  // ── Meetings helpers ────────────────────────────────────────────────────────

  function updateMeetings(patch: Partial<EodMeetingsSettings>) {
    setMeetingsSettings(s => ({ ...s, ...patch }))
  }

  function addRule() {
    const newRule: MeetingRule = { id: makeId(), keywords: [], target: 'otherTasks' }
    updateMeetings({ rules: [...meetingsSettings.rules, newRule] })
  }

  function removeRule(idx: number) {
    updateMeetings({ rules: meetingsSettings.rules.filter((_, i) => i !== idx) })
  }

  function patchRule(idx: number, patch: Partial<MeetingRule>) {
    updateMeetings({
      rules: meetingsSettings.rules.map((r, i) => i === idx ? { ...r, ...patch } : r),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="md:max-w-2xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">EOD Settings</DialogTitle>

        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={v => setActiveTab(v as DialogTab)}
          className="flex h-[32rem]"
        >
          {/* ── Left sidebar ── */}
          <aside className="flex w-44 shrink-0 flex-col border-r border-border/50 bg-muted/20">
            <div className="px-4 pt-5 pb-3">
              <p className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                Settings
              </p>
            </div>
            <TabsList
              variant="line"
              className="h-auto w-full flex-col items-stretch gap-0.5 bg-transparent px-2"
            >
              {DIALOG_TABS.map(({ value, label, icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(
                    'group/tab h-9 justify-start gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium',
                    'text-muted-foreground/70 hover:text-foreground',
                    'data-active:bg-background/80 data-active:text-foreground dark:data-active:bg-input/40',
                    'after:hidden',
                  )}
                >
                  <HugeiconsIcon
                    icon={icon}
                    size={15}
                    className="shrink-0 opacity-70 group-data-active/tab:opacity-100"
                  />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </aside>

          {/* ── Right content ── */}
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
              aria-label="Close settings"
              className="absolute top-3 right-3 z-10 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>

            {/* ── Email tab ── */}
            <TabsContent value="email" className="mt-0 flex h-full flex-col overflow-y-auto px-6 pt-5 pb-6 no-scrollbar">
              <div className="mb-4">
                <h2 className="text-sm font-semibold">Email</h2>
                <Separator className="mt-3" />
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="eod-to" className="block text-sm font-medium">To</label>
                  <Input
                    id="eod-to"
                    type="email"
                    name="toEmail"
                    autoComplete="off"
                    spellCheck={false}
                    value={toInput}
                    onChange={e => { setToInput(e.target.value); setToError('') }}
                    placeholder="manager@company.com"
                    aria-invalid={toError ? true : undefined}
                  />
                  {toError && <p className="text-xs text-destructive" aria-live="polite">{toError}</p>}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="eod-cc" className="block text-sm font-medium">CC</label>
                  {ccChips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {ccChips.map(email => (
                        <span key={email} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                          <span className="max-w-48 truncate">{email}</span>
                          <button
                            type="button"
                            onClick={() => setCcChips(prev => prev.filter(e => e !== email))}
                            aria-label={`Remove ${email}`}
                            className="rounded p-0.5 hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring outline-none"
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      ref={ccRef}
                      id="eod-cc"
                      type="email"
                      name="ccEmail"
                      autoComplete="off"
                      spellCheck={false}
                      className="flex-1"
                      value={ccInput}
                      onChange={e => { setCcInput(e.target.value); setCcError('') }}
                      onKeyDown={handleCcKeyDown}
                      placeholder="email@company.com"
                      aria-invalid={ccError ? true : undefined}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={() => tryAddCc(ccInput)} disabled={!ccInput.trim()} aria-label="Add CC email">
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                  {ccError
                    ? <p className="text-xs text-destructive" aria-live="polite">{ccError}</p>
                    : <p className="text-xs text-muted-foreground">Press Enter or comma to add multiple</p>
                  }
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div>
                    <p className="text-sm font-medium">Include Signature in Email</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Disable if Outlook adds your signature automatically</p>
                  </div>
                  <Switch checked={embedSignature} onCheckedChange={setEmbedSignature} aria-label="Include signature in email" />
                </div>

                {embedSignature && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Outlook Signature</p>
                    <SignatureEditor value={signature} onChange={setSignature} />
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Meetings tab ── */}
            <TabsContent value="meetings" className="mt-0 flex h-full flex-col overflow-y-auto px-6 pt-5 pb-6 no-scrollbar">
              <div className="mb-4">
                <h2 className="text-sm font-semibold">Meetings</h2>
                <Separator className="mt-3" />
              </div>
              <div className="space-y-5">

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Sync Outlook Meetings</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Auto-import today's calendar meetings on EOD open</p>
                  </div>
                  <Switch checked={meetingsSettings.enabled} onCheckedChange={v => updateMeetings({ enabled: v })} aria-label="Sync Outlook meetings" />
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Attach Duration</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Append meeting length in hours, e.g. (0.5 Hr)</p>
                  </div>
                  <Switch checked={meetingsSettings.attachDuration} onCheckedChange={v => updateMeetings({ attachDuration: v })} aria-label="Attach meeting duration" />
                </div>

                <Separator />

                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium">Exclude Keywords</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Meetings matching any of these keywords are ignored entirely.</p>
                  </div>
                  <KeywordChipsInput
                    keywords={meetingsSettings.excludeKeywords}
                    onChange={kws => updateMeetings({ excludeKeywords: kws })}
                  />
                </div>

                <Separator />

                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Routing Rules</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Route meetings by keyword match. First matching rule wins. Everything else goes to Other Tasks.
                    </p>
                  </div>

                  {meetingsSettings.rules.length > 0 && (
                    <div className="space-y-2.5">
                      {meetingsSettings.rules.map((rule, idx) => (
                        <div key={rule.id} className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <Select
                              value={rule.target}
                              onValueChange={v => patchRule(idx, {
                                target: v as MeetingRouteTarget,
                                projectName: v !== 'project' ? undefined : rule.projectName,
                              })}
                            >
                              <SelectTrigger className="h-7 w-32 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="project">Projects</SelectItem>
                                <SelectItem value="otherTasks">Other Tasks</SelectItem>
                              </SelectContent>
                            </Select>
                            {rule.target === 'project' && (
                              <Input
                                value={rule.projectName ?? ''}
                                placeholder="Project name (optional)…"
                                className="h-7 flex-1 text-xs"
                                onChange={e => patchRule(idx, { projectName: e.target.value || undefined })}
                              />
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              tabIndex={-1}
                              onClick={() => removeRule(idx)}
                              aria-label="Remove rule"
                              className="ml-auto shrink-0 text-muted-foreground/50 hover:text-destructive"
                            >
                              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                            </Button>
                          </div>
                          <KeywordChipsInput
                            keywords={rule.keywords}
                            onChange={kws => patchRule(idx, { keywords: kws })}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <Button type="button" variant="outline" size="sm" onClick={addRule} className="gap-1.5">
                    <Plus className="size-3.5" aria-hidden="true" /> Add Rule
                  </Button>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" size="sm" onClick={handleSave}>Save Settings</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
