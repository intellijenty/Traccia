import { useState, useRef, useEffect } from "react"
import { Mail, Users, Settings, RotateCcw, Send, Keyboard } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { makeDefaultFormState, makeId } from "@/lib/eod-types"
import type { EodFormState, EodHistoryEntry } from "@/lib/eod-types"
import { applyMeetingSync } from "@/lib/eod-meeting-sync"
import { loadMeetingsSettings } from "@/lib/eod-meetings-settings"
import {
  buildEodHtml,
  buildEodPlainText,
  buildEodSubject,
  buildEditorHtml,
  flattenSignatureToBreaks,
  detectDateSeparator,
} from "@/lib/eod-utils"
import { FormEditor } from "@/components/eod/form-editor"
import type { FormLayoutMode } from "@/components/eod/form-editor"
import { RichEditor } from "@/components/eod/rich-editor"
import type { RichEditorHandle } from "@/components/eod/rich-editor"
import {
  EodSettingsDialog,
  loadEodSettings,
  saveEodSettings,
} from "@/components/eod/eod-settings-dialog"
import { EodHistoryPanel } from "@/components/eod/eod-history-panel"
import { EodHistoryViewDialog } from "@/components/eod/eod-history-view-dialog"
import { EodKeyboardDialog } from "@/components/eod/eod-keyboard-dialog"
import { EodThemeProvider, EodThemeToggleButton } from "@/components/eod/eod-theme-toggle"
import { HugeiconsIcon } from "@hugeicons/react"
import { Refresh03Icon, Target02Icon } from "@hugeicons/core-free-icons"
import { Toggle } from "@/components/ui/toggle"
import { Spinner } from "@/components/ui/spinner"

type EodTab = "form" | "editor"

const isElectron = typeof window !== "undefined" && !!window.electronAPI

const KEYS = {
  settings: "traccia:eod-settings",
  activeTab: "traccia:eod-active-tab",
  editorHtml: "traccia:eod-editor-html",
  formState: "traccia:eod-form-state",
  subject: "traccia:eod-subject",
  history: "traccia:eod-history",
  lastSent: "traccia:eod-last-sent", // legacy
  formMode: "traccia:eod-form-mode",
  meetingsSyncDate: "traccia:eod-meetings-sync-date",
} as const

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"
}

function hasSyncedToday(): boolean {
  return localStorage.getItem(KEYS.meetingsSyncDate) === todayDateString()
}

function markSyncedToday(): void {
  localStorage.setItem(KEYS.meetingsSyncDate, todayDateString())
}

// ── Migration ────────────────────────────────────────────────────────────────
// Handles old single-project shape: { project, projectStatus, tasksCompleted, ... }

function migrateFormState(raw: unknown): EodFormState {
  if (!raw || typeof raw !== 'object') return makeDefaultFormState()
  const obj = raw as Record<string, unknown>
  if ('project' in obj && !('projects' in obj)) {
    const { project, projectStatus, tasksCompleted, ...rest } = obj
    return {
      ...(rest as Omit<EodFormState, 'projects'>),
      projects: [{
        id: makeId(),
        name: (project as string) ?? '',
        status: (projectStatus as EodFormState['projects'][0]['status']) ?? 'green',
        statusNote: null,
        tasksCompleted: (tasksCompleted as EodFormState['projects'][0]['tasksCompleted']) ?? [],
      }],
    }
  }
  // Normalize projects array: ensure new fields exist on each entry
  if ('projects' in obj && Array.isArray(obj.projects)) {
    const migrated = {
      ...obj,
      projects: (obj.projects as Record<string, unknown>[]).map(p => ({
        ...p,
        statusNote: (p.statusNote as string | null | undefined) ?? null,
      })),
    } as EodFormState
    return migrated
  }
  return makeDefaultFormState()
}

// ── Loaders ──────────────────────────────────────────────────────────────────

function loadDraft(): EodFormState {
  const today = new Date().toLocaleDateString("en-CA")
  try {
    const raw = localStorage.getItem(KEYS.formState)
    if (raw) {
      const state = migrateFormState(JSON.parse(raw))
      return state.date !== today ? { ...state, date: today } : state
    }
  } catch { /* ignore */ }
  // Migrate from legacy last-sent if exists
  try {
    const legacy = localStorage.getItem(KEYS.lastSent)
    if (legacy) return { ...migrateFormState(JSON.parse(legacy)), date: today }
  } catch { /* ignore */ }
  return makeDefaultFormState()
}

function loadHistory(): Record<string, EodHistoryEntry> {
  try {
    const raw = localStorage.getItem(KEYS.history)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, EodHistoryEntry>
      const pruned = pruneHistory(parsed, 5)
      // If pruning removed entries, persist the pruned result back to storage
      if (Object.keys(pruned).length !== Object.keys(parsed).length) {
        try { localStorage.setItem(KEYS.history, JSON.stringify(pruned)) } catch { /* ignore */ }
      }
      return pruned
    }
  } catch { /* ignore */ }
  return {}
}

function pruneHistory(h: Record<string, EodHistoryEntry>, maxDays = 5) {
  // Dates are stored as YYYY-MM-DD (en-CA) so lexicographic sorting works.
  const keys = Object.keys(h).sort((a, b) => b.localeCompare(a)) // newest first
  const kept = keys.slice(0, maxDays)
  const pruned: Record<string, EodHistoryEntry> = {}
  for (const k of kept) pruned[k] = h[k]
  return pruned
}

function saveHistory(h: Record<string, EodHistoryEntry>) {
  const pruned = pruneHistory(h, 5)
  try { localStorage.setItem(KEYS.history, JSON.stringify(pruned)) } catch { /* ignore */ }
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EodPage() {
  const savedTab = localStorage.getItem(KEYS.activeTab) as EodTab | null
  const savedEditorHtml = localStorage.getItem(KEYS.editorHtml) ?? ""

  const [activeTab, setActiveTab] = useState<EodTab>(savedTab ?? "form")
  const [formState, setFormState] = useState<EodFormState>(loadDraft)
  const [emailSettings, setEmailSettings] = useState(loadEodSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [keyboardDialogOpen, setKeyboardDialogOpen] = useState(false)
  const [formMode, setFormMode] = useState<FormLayoutMode>(
    () => (localStorage.getItem(KEYS.formMode) as FormLayoutMode | null) ?? 'comfortable'
  )
  const [isOpening, setIsOpening] = useState(false)
  const [isPrewarming, setIsPrewarming] = useState(false)
  const [isSyncingMeetings, setIsSyncingMeetings] = useState(false)
  const syncingInProgress = useRef(false)
  const [history, setHistory] = useState<Record<string, EodHistoryEntry>>(loadHistory)
  const [viewingEntry, setViewingEntry] = useState<EodHistoryEntry | null>(null)

  // Subject — persisted separately.
  // If the day changed and the saved subject was auto-generated for the old date, regenerate it.
  const [subject, setSubject] = useState(() => {
    const today = new Date().toLocaleDateString("en-CA")
    const savedSubject = localStorage.getItem(KEYS.subject)
    if (!savedSubject) return buildEodSubject(today)
    try {
      const raw = localStorage.getItem(KEYS.formState)
      if (raw) {
        const savedDate = (JSON.parse(raw) as EodFormState).date
        if (savedDate !== today && (
          savedSubject === buildEodSubject(savedDate, '-') ||
          savedSubject === buildEodSubject(savedDate, '/')
        )) {
          return buildEodSubject(today, detectDateSeparator(savedSubject))
        }
      }
    } catch { /* ignore */ }
    return savedSubject
  })
  const [editingSubject, setEditingSubject] = useState(false)

  // Editor sync state
  const [editorInitialized, setEditorInitialized] = useState(!!savedEditorHtml)
  const [formChangedAfterEditorInit, setFormChangedAfterEditorInit] = useState(false)

  const richEditorRef = useRef<RichEditorHandle>(null)
  const actionsRef = useRef({ handleOpenInOutlook: () => {}, handleRestoreLatest: () => {} })

  // Restore editor HTML if returning to editor tab
  useEffect(() => {
    if (savedEditorHtml) {
      richEditorRef.current?.setContent(savedEditorHtml)
    }
    // Migrate legacy last-sent key
    if (localStorage.getItem(KEYS.lastSent)) {
      localStorage.removeItem(KEYS.lastSent)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-save form state (debounced 500ms)
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(KEYS.formState, JSON.stringify(formState))
    }, 500)
    return () => clearTimeout(t)
  }, [formState])

  // Persist subject immediately (short string, no debounce needed)
  useEffect(() => {
    localStorage.setItem(KEYS.subject, subject)
  }, [subject])

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey || !e.shiftKey) return
      switch (e.code) {
        case "KeyO":
          e.preventDefault()
          actionsRef.current.handleOpenInOutlook()
          break
        case "KeyR":
          e.preventDefault()
          actionsRef.current.handleRestoreLatest()
          break
        case "KeyS":
          e.preventDefault()
          setSettingsOpen(true)
          break
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // ── Meeting sync ────────────────────────────────────────────────────────────

  async function runMeetingSync({ force = false } = {}) {
    if (!isElectron) return
    const settings = loadMeetingsSettings()
    if (!settings.enabled) return
    if (!force && hasSyncedToday()) return
    if (syncingInProgress.current) return
    syncingInProgress.current = true
    setIsSyncingMeetings(true)
    try {
      const result = await window.electronAPI.eodGetMeetingsToday()
      if (result.ok) {
        updateFormState(s => applyMeetingSync(s, result.meetings, settings))
        markSyncedToday()
      }
    } finally {
      setIsSyncingMeetings(false)
      syncingInProgress.current = false
    }
  }

  useEffect(() => {
    void runMeetingSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── State updaters ──────────────────────────────────────────────────────────

  function updateFormState(
    updater: EodFormState | ((s: EodFormState) => EodFormState)
  ) {
    setFormState(updater)
    if (editorInitialized) setFormChangedAfterEditorInit(true)
  }

  // ── Editor sync ─────────────────────────────────────────────────────────────

  function switchToEditor() {
    if (!editorInitialized) {
      richEditorRef.current?.setContent(buildEditorHtml(formState))
      setEditorInitialized(true)
      setFormChangedAfterEditorInit(false)
    }
    setActiveTab("editor")
  }

  function syncEditorFromForm() {
    richEditorRef.current?.setContent(buildEditorHtml(formState))
    localStorage.setItem(KEYS.editorHtml, richEditorRef.current?.getHtml() ?? "")
    setFormChangedAfterEditorInit(false)
  }

  function handleTabChange(tab: EodTab) {
    if (activeTab === "editor" && tab === "form") {
      localStorage.setItem(KEYS.editorHtml, richEditorRef.current?.getHtml() ?? "")
    }
    localStorage.setItem(KEYS.activeTab, tab)
    if (tab === "editor") switchToEditor()
    else setActiveTab(tab)
  }

  // ── History actions ─────────────────────────────────────────────────────────

  function handleRestoreFromHistory(entry: EodHistoryEntry) {
    if (entry.formState) {
      updateFormState(migrateFormState(entry.formState))
    }
    setSubject(entry.subject)
    if (entry.mode === "editor") {
      richEditorRef.current?.setContent(entry.htmlBody)
      setEditorInitialized(true)
      setFormChangedAfterEditorInit(false)
      localStorage.setItem(KEYS.editorHtml, entry.htmlBody)
    } else if (editorInitialized && entry.formState) {
      // Regenerate editor from restored form state so stale content isn't shown on next editor switch
      const restoredHtml = buildEditorHtml(entry.formState)
      richEditorRef.current?.setContent(restoredHtml)
      setFormChangedAfterEditorInit(false)
      localStorage.setItem(KEYS.editorHtml, restoredHtml)
    }
    handleTabChange(entry.mode)
    setViewingEntry(null)
  }

  function handleRestoreLatest() {
    const today = new Date().toLocaleDateString("en-CA")
    const sorted = Object.values(history)
      .filter(e => e.date !== today)
      .sort((a, b) => b.date.localeCompare(a.date))
    if (sorted.length > 0) handleRestoreFromHistory(sorted[0])
  }

  // ── Open in Outlook ─────────────────────────────────────────────────────────

  async function handleOpenInOutlook() {
    if (!isElectron) return
    // Snapshot mutable values before the async IPC call to prevent stale-capture bugs
    const snapshotFormState = formState
    const snapshotSubject = subject
    const snapshotActiveTab = activeTab
    setIsOpening(true)
    // Subscribe to phase events for this open. Main emits 'prewarming' while
    // it boots New Outlook on cold start and 'done' when the EML hand-off is
    // imminent. Listener cleaned up alongside isOpening reset.
    const unsubscribePhase = window.electronAPI.onOutlookPhase?.((phase) => {
      setIsPrewarming(phase === 'prewarming')
    })
    try {
      let htmlBody: string
      let plainText: string
      if (snapshotActiveTab === "form") {
        htmlBody = buildEodHtml(snapshotFormState, emailSettings)
        plainText = buildEodPlainText(snapshotFormState, emailSettings)
      } else {
        const rawHtml = richEditorRef.current?.getHtml() ?? ""
        const font = "font-family:Aptos,Calibri,Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6"
        const embedSig = emailSettings.embedSignature !== false
        const sigHtml = embedSig && emailSettings.signature
          ? `<br><div style="${font};margin:0;line-height:1.5">${flattenSignatureToBreaks(emailSettings.signature)}</div>`
          : ''
        htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:20px;background:#fff"><div style="${font}">${rawHtml}${sigHtml}</div></body></html>`
        plainText = richEditorRef.current?.getText() ?? ""
        localStorage.setItem(KEYS.editorHtml, rawHtml)
      }

      await window.electronAPI.eodOpenInOutlook({
        to: emailSettings.to,
        cc: emailSettings.cc.join(";"),
        subject: snapshotSubject,
        htmlBody,
        plainText,
      })

      // Save to history using snapshotted values.
      // Ensure the date used for history reflects the current local date. If the app stays
      // open across midnight the in-memory formState.date may be stale (yesterday), which
      // causes today's sends to be saved under yesterday's entry. Use the current date and
      // persist the corrected date back to the draft.
      const currentDate = new Date().toLocaleDateString("en-CA")
      const entryDate = snapshotFormState.date === currentDate ? snapshotFormState.date : currentDate

      const entry: EodHistoryEntry = {
        date: entryDate,
        subject: snapshotSubject,
        mode: snapshotActiveTab,
        htmlBody,
        plainText,
        formState: snapshotActiveTab === "form" ? { ...snapshotFormState, date: entryDate } : undefined,
        sentAt: new Date().toISOString(),
      }

      const updated = { ...history, [entryDate]: entry }
      const pruned = pruneHistory(updated, 5)
      saveHistory(pruned)
      setHistory(pruned)

      // If the in-memory draft had a stale date, update it and persist so future saves use the corrected date.
      if (snapshotFormState.date !== entryDate) {
        const corrected = { ...snapshotFormState, date: entryDate }
        setFormState(corrected)
        try {
          localStorage.setItem(KEYS.formState, JSON.stringify(corrected))
        } catch { /* ignore */ }
      }
    } finally {
      unsubscribePhase?.()
      setIsPrewarming(false)
      setIsOpening(false)
    }
  }

  actionsRef.current.handleOpenInOutlook = handleOpenInOutlook
  actionsRef.current.handleRestoreLatest = handleRestoreLatest

  const longDate = formatDateLong(formState.date)

  return (
    <TooltipProvider delayDuration={500}>
      <div className="h-full p-6">
        <EodThemeProvider>
        <div className="mb-0 flex h-full overflow-hidden rounded-lg border bg-background">

          {/* ── Left Sidebar ── */}
          <aside className="flex w-78 shrink-0 flex-col border-r border-border">
            {/* Header */}
            <div className="px-6 pt-7 pb-6">
              <h1
                className="text-lg text-foreground font-semibold tracking-tight"
                style={{ textWrap: "balance" } as React.CSSProperties}
              >
                Power Composer
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{longDate}</p>
            </div>

            {/* Metadata */}
            <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-6">

              {/* Subject — editable on click */}
              <div className="space-y-1.5">
                <div className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Subject
                </div>
                {editingSubject ? (
                  <input
                    autoFocus
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    onBlur={() => setEditingSubject(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape")
                        setEditingSubject(false)
                    }}
                    className="w-full bg-transparent text-sm font-medium focus:outline-none"
                    spellCheck={false}
                  />
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p
                        className="cursor-pointer text-foreground text-sm font-medium transition-colors hover:text-muted-foreground"
                        onClick={() => setEditingSubject(true)}
                      >
                        {subject}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Click to edit</TooltipContent>
                  </Tooltip>
                )}
              </div>

              {/* TO */}
              {emailSettings.to && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                    To
                  </div>
                  <p className="truncate text-foreground pl-5.5 text-sm">{emailSettings.to}</p>
                </div>
              )}

              {/* CC */}
              {emailSettings.cc.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    CC
                  </div>
                  <div className="space-y-0.5 pl-5.5 text-foreground">
                    {emailSettings.cc.map((email) => (
                      <p key={email} className="truncate text-sm">
                        {email}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Settings */}
              <Button
                type="button"
                tabIndex={-1}
                variant="ghost"
                size="sm"
                onClick={() => setSettingsOpen(true)}
                className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="flex-1 text-left">Settings</span>
                {/* <KbdGroup><Kbd className="opacity-50">Ctrl</Kbd><Kbd className="opacity-50">⇧</Kbd><Kbd className="opacity-50">S</Kbd></KbdGroup> */}
              </Button>

              {/* Restore Last Sent (previous day) */}
              {Object.values(history).some(e => e.date !== new Date().toLocaleDateString("en-CA")) && (
                <Button
                  type="button"
                  tabIndex={-1}
                  variant="ghost"
                  size="sm"
                  onClick={handleRestoreLatest}
                  className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="flex-1 text-left">Restore Last Sent</span>
                  {/* <KbdGroup><Kbd className="opacity-50">Ctrl</Kbd><Kbd className="opacity-50">⇧</Kbd><Kbd className="opacity-50">R</Kbd></KbdGroup> */}
                </Button>
              )}

              <Separator />

              {/* Recent Drafts history — collapsible, at bottom */}
              <EodHistoryPanel history={history} onView={setViewingEntry} />
            </div>

            {/* Bottom — Compose button */}
            <div className="border-t border-border p-5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block w-full">
                    <Button
                      type="button"
                      tabIndex={-1}
                      onClick={handleOpenInOutlook}
                      disabled={isOpening || !isElectron || !emailSettings.to}
                      className="w-full gap-2"
                    >
                      {isOpening ? (
                        <Spinner className="size-4" />
                      ) : (
                        <Send className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span>
                        {isPrewarming
                          ? "Warming up Outlook"
                          : isOpening
                            ? "Opening"
                            : "Open in Outlook"}
                      </span>
                    </Button>
                  </span>
                </TooltipTrigger>
                {!emailSettings.to && (
                  <TooltipContent side="top">
                    Add a recipient in Settings first
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          </aside>

          {/* ── Main Content ── */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex items-center gap-1 border-b border-border px-4 py-2">
              {(["form", "editor"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  tabIndex={-1}
                  onClick={() => handleTabChange(tab)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    activeTab === tab
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab === "form" ? "Form" : "Editor"}
                  {tab === "editor" && formChangedAfterEditorInit && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-orange-400"
                      aria-label="Form has unsaved changes"
                    />
                  )}
                </button>
              ))}

              <div className="ml-auto flex items-center gap-2">
                
                {/* Form layout mode toggle — only relevant on form tab */}
                {activeTab === "form" && (
                  <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                      <Toggle
                        aria-label="Toggle bookmark"
                        size="sm"
                        variant="outline"
                        tabIndex={-1}
                        className={cn(
                          "text-xs border border-border bg-muted/30 text-muted-foreground hover:bg-muted",
                          formMode === "zen" && "bg-muted text-foreground"
                        )}
                        pressed={formMode === "zen"}
                        onPressedChange={() => {
                          setFormMode((f) => {
                            const next =
                              f === "comfortable" ? "zen" : "comfortable"
                            return next
                          })
                          localStorage.setItem(
                            KEYS.formMode,
                            formMode === "comfortable" ? "zen" : "comfortable"
                          )
                        }}
                      >
                        {formMode === "zen" && (
                          <HugeiconsIcon
                            icon={Target02Icon}
                            className="size-3.5 shrink-0"
                          />
                        )}
                        Zen Mode
                      </Toggle>
                      </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Toggle zen mode
                    </TooltipContent>
                  </Tooltip>
                  // <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5 gap-0.5">
                  //   {(['comfortable', 'focused', 'zen'] as const).map(m => (
                  //     <button
                  //       key={m}
                  //       type="button"
                  //       tabIndex={-1}
                  //       onClick={() => {
                  //         setFormMode(m)
                  //         localStorage.setItem(KEYS.formMode, m)
                  //       }}
                  //     >
                  //       {m}
                  //     </button>
                  //   ))}
                  // </div>
                )}

                {activeTab === "form" && isElectron && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        tabIndex={-1}
                        onClick={() => void runMeetingSync({ force: true })}
                        disabled={isSyncingMeetings}
                        aria-label="Sync meetings from Outlook"
                      >
                        <HugeiconsIcon
                          icon={Refresh03Icon}
                          className={cn("size-3.5", isSyncingMeetings && "animate-spin")}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Sync meetings from Outlook</TooltipContent>
                  </Tooltip>
                )}

                {activeTab === "editor" && editorInitialized && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={"outline"}
                        size={"xs"}
                        tabIndex={-1}
                        onClick={syncEditorFromForm}
                      >
                        <HugeiconsIcon icon={Refresh03Icon} /> Sync from Form
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Regenerate editor content from current Form state
                    </TooltipContent>
                  </Tooltip>
                )}

                <EodThemeToggleButton />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setKeyboardDialogOpen(true)}
                      aria-label="Keyboard shortcuts"
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Keyboard Shortcuts</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Content — both always mounted */}
            <div className="flex-1 overflow-hidden">
              <div className={cn("h-full", activeTab !== "form" && "hidden")}>
                <div className="no-scrollbar h-full overflow-y-auto px-6 py-6">
                  <FormEditor value={formState} onChange={updateFormState} mode={formMode} />
                </div>
              </div>
              <div className={cn("h-full", activeTab !== "editor" && "hidden")}>
                <RichEditor ref={richEditorRef} />
              </div>
            </div>
          </div>

          {/* Dialogs */}
          <EodSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            settings={emailSettings}
            onSave={(newSettings) => {
              setEmailSettings(newSettings)
              saveEodSettings(newSettings)
            }}
          />

          <EodHistoryViewDialog
            entry={viewingEntry}
            onClose={() => setViewingEntry(null)}
            onRestoreAsDraft={handleRestoreFromHistory}
          />

          <EodKeyboardDialog
            open={keyboardDialogOpen}
            onOpenChange={setKeyboardDialogOpen}
          />
        </div>
        </EodThemeProvider>
      </div>
    </TooltipProvider>
  )
}
