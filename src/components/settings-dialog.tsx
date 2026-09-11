import { useState, useEffect } from "react"
import { useUpdater } from "@/hooks/use-updater"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Settings01Icon,
  Settings02Icon,
  Database02Icon,
  Cancel01Icon,
  UniversalAccessCircleIcon,
  InformationCircleIcon,
  Timer02FreeIcons,
} from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"
import { HotkeyRecorder } from "@/components/hotkey-recorder"
import { useHotkeySettings } from "@/hooks/use-hotkey-settings"
import { useGeneralSettings } from "@/hooks/use-general-settings"
import { useNotificationSettings } from "@/hooks/use-notification-settings"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { TimeSourceSelector } from "@/components/ui/time-source-selector"
import { Notification01Icon } from "@hugeicons/core-free-icons"

const TABS = [
  { value: "general", label: "General", icon: Settings02Icon },
  { value: "notifications", label: "Notifications", icon: Notification01Icon },
  { value: "data-controls", label: "Data Controls", icon: Database02Icon },
  {
    value: "accessibility",
    label: "Accessibility",
    icon: UniversalAccessCircleIcon,
  },
  { value: "about", label: "About", icon: InformationCircleIcon },
] as const

type TabValue = (typeof TABS)[number]["value"]

// ── Data Controls tab ─────────────────────────────────────────────────────────

type ActionState = "idle" | "loading" | "done" | "error"

function SettingGroup({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {title}
        </h3>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground/60">
            {description}
          </p>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function ActionRow({
  label,
  description,
  buttonLabel,
  destructive,
  state,
  onAction,
}: {
  label: string
  description: string
  buttonLabel: string
  destructive?: boolean
  state: ActionState
  onAction: () => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3.5 py-3">
      <div className="flex items-start gap-3">
        <div>
          <p className="text-xs font-medium">{label}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/60">
            {description}
          </p>
        </div>
      </div>
      <div className="ml-4 flex shrink-0 items-center gap-2">
        {state === "done" && (
          <span className="text-[11px] text-emerald-400">Done</span>
        )}
        {state === "error" && (
          <span className="text-[11px] text-destructive">Failed</span>
        )}
        <Button
          size="sm"
          variant={"outline"}
          className={`h-7 min-w-18 px-3 text-xs ${destructive && "text-destructive"}`}
          disabled={state === "loading"}
          onClick={onAction}
        >
          {state === "loading" ? (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block animate-spin text-[10px] leading-none"
                style={{
                  animationTimingFunction: "linear",
                  animationDuration: "0.9s",
                }}
              >
                ↻
              </span>
              Syncing…
            </span>
          ) : (
            buttonLabel
          )}
        </Button>
      </div>
    </div>
  )
}

const isElectron = typeof window !== "undefined" && !!window.electronAPI

// ── General tab ───────────────────────────────────────────────────────────────

function GeneralTab() {
  const { settings, save, loading } = useGeneralSettings()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted-foreground/50">Loading…</p>
      </div>
    )
  }

  const hasBoundary = !!settings.workBoundaryStart && !!settings.workBoundaryEnd

  return (
    <div className="space-y-6">
      <SettingGroup
        title="Startup"
        description="Control how the app behaves when your system starts"
      >
        <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3.5 py-3">
          <div>
            <p className="text-xs font-medium">Launch on startup</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/60">
              Start automatically when you log in. (Recommended)
            </p>
          </div>
          <Switch
            checked={settings.autoStart}
            onCheckedChange={(checked) =>
              save({ ...settings, autoStart: checked })
            }
          />
        </div>
      </SettingGroup>

      <SettingGroup
        title="Work Boundary"
        description="Only count local sessions within this time range as working hours. Sessions outside are tracked but excluded from totals."
      >
        <div className="space-y-3 rounded-lg border border-border/40 bg-muted/20 p-3.5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium">Enable work boundary</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                Set your earliest possible start and latest possible end
              </p>
            </div>
            <Switch
              checked={hasBoundary}
              onCheckedChange={(checked) => {
                if (checked) {
                  save({
                    ...settings,
                    workBoundaryStart: "09:00",
                    workBoundaryEnd: "21:30",
                  })
                } else {
                  save({
                    ...settings,
                    workBoundaryStart: "",
                    workBoundaryEnd: "",
                  })
                }
              }}
              size="sm"
              className="mt-0.5 shrink-0"
            />
          </div>

          {hasBoundary && (
            <div className="space-y-2.5 border-t border-border/30 pt-3">
              <div className="flex items-center gap-3">
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Earliest start
                  </label>
                  <Input
                    type="time"
                    value={settings.workBoundaryStart}
                    onChange={(e) =>
                      save({ ...settings, workBoundaryStart: e.target.value })
                    }
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <span className="mt-5 text-xs text-muted-foreground/40">
                  to
                </span>
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Latest end
                  </label>
                  <Input
                    type="time"
                    value={settings.workBoundaryEnd}
                    onChange={(e) =>
                      save({ ...settings, workBoundaryEnd: e.target.value })
                    }
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/50">
                Sessions outside this range won&apos;t count toward your working
                hours. Changing this only affects future days.
              </p>
            </div>
          )}
        </div>
      </SettingGroup>

      {hasBoundary && (
        <SettingGroup
          title="Night Shift"
          description="Define a separate work window for night shift days. Mark days as night shift from the calendar context menu."
        >
          <div className="space-y-3 rounded-lg border border-border/40 bg-muted/20 p-3.5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium">Enable night shift</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                  Adds a night shift option to the day context menu
                </p>
              </div>
              <Switch
                checked={settings.nightShiftEnabled}
                onCheckedChange={(checked) =>
                  save({ ...settings, nightShiftEnabled: checked })
                }
                size="sm"
                className="mt-0.5 shrink-0"
              />
            </div>

            {settings.nightShiftEnabled && (
              <div className="space-y-2.5 border-t border-border/30 pt-3">
                <div className="flex items-center gap-3">
                  <div className="flex flex-1 flex-col gap-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Shift start
                    </label>
                    <Input
                      type="time"
                      value={settings.nightShiftStart}
                      onChange={(e) =>
                        save({ ...settings, nightShiftStart: e.target.value })
                      }
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <span className="mt-5 text-xs text-muted-foreground/40">
                    to
                  </span>
                  <div className="flex flex-1 flex-col gap-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Shift end
                    </label>
                    <Input
                      type="time"
                      value={settings.nightShiftEnd}
                      onChange={(e) =>
                        save({ ...settings, nightShiftEnd: e.target.value })
                      }
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </SettingGroup>
      )}
    </div>
  )
}

// ── Data Controls tab ─────────────────────────────────────────────────────────

function DataControlsTab() {
  const [clearCacheState, setClearCacheState] = useState<ActionState>("idle")
  const [clearNonPermState, setClearNonPermState] =
    useState<ActionState>("idle")
  const [leaveSyncState, setLeaveSyncState] = useState<ActionState>("idle")

  async function handleClearAllCache() {
    setClearCacheState("loading")
    try {
      if (isElectron) await window.electronAPI.portalInvalidateAll()
      setClearCacheState("done")
      setTimeout(() => setClearCacheState("idle"), 2500)
    } catch {
      setClearCacheState("error")
      setTimeout(() => setClearCacheState("idle"), 2500)
    }
  }

  async function handleClearNonPermanent() {
    setClearNonPermState("loading")
    try {
      if (isElectron) {
        // Non-permanent = last 10 days. Collect today and up to 9 prior days.
        const dates: string[] = []
        const d = new Date()
        for (let i = 0; i < 10; i++) {
          dates.push(d.toLocaleDateString("en-CA"))
          d.setDate(d.getDate() - 1)
        }
        await window.electronAPI.portalInvalidate(dates)
      }
      setClearNonPermState("done")
      setTimeout(() => setClearNonPermState("idle"), 2500)
    } catch {
      setClearNonPermState("error")
      setTimeout(() => setClearNonPermState("idle"), 2500)
    }
  }

  async function handleLeaveSync() {
    setLeaveSyncState("loading")
    try {
      if (isElectron) {
        const result = await window.electronAPI.leaveSync()
        setLeaveSyncState(result.success ? "done" : "error")
      } else {
        setLeaveSyncState("done")
      }
      setTimeout(() => setLeaveSyncState("idle"), 2500)
    } catch {
      setLeaveSyncState("error")
      setTimeout(() => setLeaveSyncState("idle"), 2500)
    }
  }

  return (
    <div className="space-y-7">
      <SettingGroup
        title="Leave Data"
        description="Import leave records from the portal for smart calculations and calendar display."
      >
        <ActionRow
          label="Sync leave data"
          description="Fetches leaves from portal and saves them to local machine."
          buttonLabel="Sync now"
          state={leaveSyncState}
          onAction={handleLeaveSync}
        />
      </SettingGroup>

      <SettingGroup
        title="Portal Cache"
        description="Portal data is cached locally to reduce network requests. Permanent cache stores data older than 10 days and is not automatically cleared."
      >
        <ActionRow
          label="Clear recent cache"
          description="Removes cached portal data for the last 10 days. (Next load will re-fetch from portal)"
          buttonLabel="Clear recent"
          state={clearNonPermState}
          onAction={handleClearNonPermanent}
        />
        <ActionRow
          label="Clear all cache"
          description="Removes all cached portal data including permanent entries."
          buttonLabel="Clear all"
          destructive
          state={clearCacheState}
          onAction={handleClearAllCache}
        />
      </SettingGroup>
    </div>
  )
}

// ── Notifications tab ─────────────────────────────────────────────────────────

function NotificationRow({
  label,
  description,
  enabled,
  onToggle,
  children,
}: {
  label: string
  description: string
  enabled: boolean
  onToggle: (v: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border/40 bg-muted/20 p-3.5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium">{label}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/60">
            {description}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          size="sm"
          className="mt-0.5 shrink-0"
        />
      </div>

      {/* Options revealed when enabled */}
      {enabled && children && (
        <div className="space-y-2.5 border-t border-border/30 pt-3">
          {children}
        </div>
      )}
    </div>
  )
}

function NotificationsTab() {
  const { prefs, save, loading } = useNotificationSettings()
  const [needsRestart, setNeedsRestart] = useState(false)

  // handleSave is only reachable via user interaction — the form is hidden
  // while loading is true — so setNeedsRestart(true) is always intentional.
  function handleSave(updated: Partial<typeof prefs>) {
    setNeedsRestart(true)
    save(updated)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted-foreground/50">Loading…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SettingGroup
        title="Daily Target"
        description="Notifications related to reaching your daily hour target"
      >
        {/* Target completion */}
        <NotificationRow
          label="Target reached"
          description="System notification when you hit your daily target"
          enabled={prefs.targetEnabled}
          onToggle={(v) => handleSave({ targetEnabled: v })}
        >
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-muted-foreground">
              Time source
            </label>
            <TimeSourceSelector
              value={prefs.targetSource}
              onChange={(v) => handleSave({ targetSource: v })}
            />
          </div>
          <div className="flex flex-col space-y-2">
            <label className="text-[11px] font-medium text-muted-foreground">
              Message
            </label>
            <Input
              value={prefs.targetMessage}
              onChange={(e) => handleSave({ targetMessage: e.target.value })}
              placeholder="Target completed for today"
              className="h-8 text-xs"
            />
          </div>
        </NotificationRow>

        {/* EOD reminder */}
        <NotificationRow
          label="EOD reminder"
          description="System notification X minutes before reaching target"
          enabled={prefs.eodEnabled}
          onToggle={(v) => handleSave({ eodEnabled: v })}
        >
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-muted-foreground">
              Time source
            </label>
            <TimeSourceSelector
              value={prefs.eodSource}
              onChange={(v) => handleSave({ eodSource: v })}
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-center space-x-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                Minutes before target
              </label>
              <Input
                type="number"
                min={1}
                max={30}
                value={prefs.eodMinutes}
                onChange={(e) =>
                  handleSave({
                    eodMinutes: Math.max(1, parseInt(e.target.value) || 1),
                  })
                }
                className="h-8 w-20 text-xs"
              />
            </div>
          </div>
          <div className="flex flex-col space-y-2">
            <label className="text-[11px] font-medium text-muted-foreground">
              Message
            </label>
            <Input
              value={prefs.eodMessage}
              onChange={(e) => handleSave({ eodMessage: e.target.value })}
              placeholder="EOD Reminder! We are close to reach our target!"
              className="h-8 text-xs"
            />
          </div>
        </NotificationRow>
      </SettingGroup>

      {/* Restart banner */}
      {needsRestart && (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/25 bg-amber-500/8 px-3.5 py-2.5">
          <p className="text-[11px] text-amber-400/80">
            Restart required to apply changes
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-amber-500/35 px-3 text-[11px] text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
            onClick={() => {
              if (isElectron) window.electronAPI.restartApp()
            }}
          >
            Restart now
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Accessibility tab content ─────────────────────────────────────────────────

function AccessibilityTab() {
  const { settings, save, loading } = useHotkeySettings()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted-foreground/50">Loading…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* App Hotkey section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            App Hotkey
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground/60">
            Quickly show or hide the app window from anywhere
          </p>
        </div>

        {/* Enable toggle */}
        <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3.5 py-3">
          <div>
            <p className="text-xs font-medium">Enable hotkey</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/60">
              Register a global keyboard shortcut
            </p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={() =>
              save({ ...settings, enabled: !settings.enabled })
            }
          />
        </div>

        {/* Hotkey combination */}
        <div
          className={cn(
            "flex flex-col space-y-1 transition-opacity",
            !settings.enabled && "pointer-events-none opacity-40"
          )}
        >
          <label className="text-xs font-medium">Shortcut</label>
          <HotkeyRecorder
            value={settings.combo}
            defaultValue="Alt+Space"
            requireModifier
            onChange={(combo) => save({ ...settings, combo })}
          />
          <p className="text-[11px] text-muted-foreground/50">
            Click the shortcut to record a new one. Modifier key required.
          </p>
        </div>

        {/* Mode selector */}
        {/* <div
          className={cn(
            "flex flex-col space-y-1 transition-opacity",
            !settings.enabled && "pointer-events-none opacity-40"
          )}
        >
          <label className="text-xs font-medium">Behavior</label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                {
                  mode: "press" as const,
                  title: "Press to Display",
                  desc: "Press once to show, press again to hide",
                },
                {
                  mode: "push" as const,
                  title: "Push to Display",
                  desc: "Hold the shortcut to show, release to hide",
                },
              ] as const
            ).map(({ mode, title, desc }) => (
              <button
                key={mode}
                type="button"
                onClick={() => save({ ...settings, mode })}
                className={cn(
                  "flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-colors",
                  settings.mode === mode
                    ? "border-primary/40 bg-primary/8 text-foreground"
                    : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border/70 hover:bg-muted/40"
                )}
              >
                <span className="text-[11px] font-semibold">{title}</span>
                <span className="mt-0.5 text-[10px] leading-tight opacity-70">
                  {desc}
                </span>
              </button>
            ))}
          </div>
        </div> */}
      </div>
    </div>
  )
}

// ── About tab ────────────────────────────────────────────────────────────────

function AboutTab() {
  const [version, setVersion] = useState<string>("…")
  const { checkNow } = useUpdater()

  useEffect(() => {
    if (isElectron) {
      window.electronAPI.getAppVersion().then(setVersion)
    }
  }, [])

  return (
    <div className="space-y-6">
      {/* App identity */}
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/40 ring-1 ring-border/40">
          <HugeiconsIcon icon={Timer02FreeIcons} size={34} />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold">Traccia</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground/60">
            v{version}
          </p>
        </div>
      </div>

      <div className="h-px bg-border/40" />

      {/* Updates */}
      <SettingGroup
        title="App Updates"
        description="Updates are downloaded in the background and installed on restart."
      >
        <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3.5 py-3">
          <div>
            <p className="text-xs font-medium">Check for updates</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/60">
              You'll be prompted before anything downloads.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="ml-4 h-7 shrink-0 px-3 text-xs"
            onClick={checkNow}
          >
            Check now
          </Button>
        </div>
      </SettingGroup>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function SettingsDialog() {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabValue>("general")

  useEffect(() => {
    const open = () => setOpen(true)
    const toggle = () => setOpen((v) => !v)
    window.addEventListener("traccia:open-settings", open)
    window.addEventListener("traccia:toggle-settings", toggle)
    return () => {
      window.removeEventListener("traccia:open-settings", open)
      window.removeEventListener("traccia:toggle-settings", toggle)
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Trigger */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Open settings"
      >
        <HugeiconsIcon icon={Settings01Icon} size={16} />
      </Button>

      <DialogContent
        showCloseButton={false}
        className="w-full max-w-[80vw] gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>

        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabValue)}
          className="flex h-125"
        >
          {/* ── Left sidebar ── */}
          <aside className="flex w-48 shrink-0 flex-col border-r border-border/50 bg-muted/20">
            <div className="px-4 pt-5 pb-3">
              <p className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                Settings
              </p>
            </div>

            <TabsList
              variant="line"
              className="h-auto w-full flex-col items-stretch gap-0.5 bg-transparent px-2"
            >
              {TABS.map(({ value, label, icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(
                    "group/tab h-9 justify-start gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium",
                    "text-muted-foreground/70 hover:text-foreground",
                    "data-active:bg-background/80 data-active:text-foreground dark:data-active:bg-input/40",
                    "after:hidden"
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
            {/* Close button */}
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-3 right-3 z-10 bg-secondary/60 text-muted-foreground hover:text-foreground"
                aria-label="Close settings"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
              </Button>
            </DialogClose>

            {TABS.map(({ value, label }) => (
              <TabsContent
                key={value}
                value={value}
                className="mt-0 no-scrollbar flex h-full flex-col overflow-y-auto px-7 pt-6 pb-7"
              >
                <div className="mb-5">
                  <h2 className="text-sm font-semibold">{label}</h2>
                  <Separator className="mt-3" />
                </div>

                {value === "general" ? (
                  <GeneralTab />
                ) : value === "notifications" ? (
                  <NotificationsTab />
                ) : value === "data-controls" ? (
                  <DataControlsTab />
                ) : value === "accessibility" ? (
                  <AccessibilityTab />
                ) : (
                  <AboutTab />
                )}
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
