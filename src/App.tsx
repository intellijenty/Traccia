import { useState, useEffect, useRef } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { StatusCard } from "@/components/status-card"
import { TotalCard } from "@/components/total-card"
import { ManualEntry } from "@/components/manual-entry"
import { EventLog } from "@/components/event-log"
import { PortalCardsSkeleton, PortalSection } from "@/components/portal-section"
import { DayView } from "@/components/day-view"
import { WeeklyCalendar } from "@/components/weekly-calendar"
import { WeeklyStats } from "@/components/weekly-stats"
import { usePunchData } from "@/hooks/use-punch-data"
import { useWindowSize } from "@/hooks/use-window-size"
import { useDayMarks } from "@/hooks/use-day-marks"
import { useWorkWindows } from "@/hooks/use-work-windows"
import { useDayTargets } from "@/hooks/use-day-targets"
import { useGeneralSettings } from "@/hooks/use-general-settings"
import { useWeeklyTarget } from "@/hooks/use-weekly-target"
import {
  getLocalDate,
  getWeekRange,
  getDaysOfWeek,
  formatDateDisplay,
} from "@/lib/week-utils"
import { getYearMonth, getWeekdaysInMonth } from "@/lib/month-utils"
import { MonthlyCalendar } from "@/components/monthly-calendar"
import { MonthlyInsights } from "@/components/monthly-insights"
import { usePortalRange } from "@/hooks/use-portal-range"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Timer02Icon,
  Globe02Icon,
  Calendar02Icon,
} from "@hugeicons/core-free-icons"
import { NarrowBalanceChips } from "@/components/narrow-insight-bar"
import {
  PortalStoreProvider,
  usePortalStoreContext,
} from "@/contexts/portal-store"
import { SettingsDialog } from "@/components/settings-dialog"
import { ShortcutsDialog } from "@/components/shortcuts-dialog"
import { useHotkeyBehavior } from "@/hooks/use-hotkey-behavior"
import { useAppShortcuts } from "@/hooks/use-app-shortcuts"
import { useNotificationEngine } from "@/hooks/use-notification-engine"
import { useNotificationSettings } from "@/hooks/use-notification-settings"
import { useUpdater } from "@/hooks/use-updater"
import { Toaster } from "@/components/ui/sonner"
import { cn, computeLocalBreakSeconds } from "@/lib/utils"
import { OnboardingController } from "@/components/onboarding/onboarding-controller"
import { ReleaseNotesController } from "@/components/release-notes-controller"
import LicenseMonitor from "./components/LicenseMonitor"
import { Badge } from "./components/ui/badge"
import { TitleBar } from "./components/ui/title-bar"
import { StatusBar } from "./components/ui/status-bar"
import type { Page } from "@/lib/navigation"
import { EodPage } from "@/pages/eod-page"
import { PlaygroundOverlay } from "@/components/playground/playground-overlay"

const isElectron = typeof window !== "undefined" && !!window.electronAPI

const WIDE_BREAKPOINT = 860
const ULTRA_WIDE_BREAKPOINT = 1200

// ── Notification engine bridge ────────────────────────────────────────────────
// Mounts inside PortalStoreProvider so usePunchData can subscribe to IPC.
// Loads settings independently — keeps App root clean.

function AppUpdater() {
  useUpdater()
  return null
}

function AppNotifications() {
  const { prefs } = useNotificationSettings()
  const { cache } = usePortalStoreContext()
  const today = new Date().toLocaleDateString("en-CA")
  const todayPortal = cache[today]?.data
  const portalSecondsToday = todayPortal?.success
    ? todayPortal.totalMinutes * 60
    : 0
  const todayLiveMinutes = Math.floor(portalSecondsToday / 60)
  const { dayTargets } = useDayTargets()
  const todayCustomTarget = dayTargets.get(today) ?? null
  const { workWindows } = useWorkWindows()
  const todayWorkWindowStart = workWindows.get(today)?.start_time ?? null
  const { adjustedTargetMinutes } = useWeeklyTarget(todayLiveMinutes, todayCustomTarget, todayWorkWindowStart)
  const targetChangeKey = todayCustomTarget
    ? `${todayCustomTarget.type}:${todayCustomTarget.value ?? ""}`
    : ""

  useNotificationEngine({
    dailyTargetSeconds: adjustedTargetMinutes * 60,
    portalSecondsToday,
    targetEnabled: prefs.targetEnabled,
    targetSource: prefs.targetSource,
    targetMessage: prefs.targetMessage,
    eodEnabled: prefs.eodEnabled,
    eodSource: prefs.eodSource,
    eodMinutes: prefs.eodMinutes,
    eodMessage: prefs.eodMessage,
    targetChangeKey,
  })

  return null
}

// ── Narrow layout: identical to original ──

interface NarrowLayoutProps {
  selectedDate: string
  onSelectDate: (date: string) => void
  todayCustomTarget?: import("@/lib/types").DayTarget | null
}

function NarrowLayout({
  selectedDate,
  onSelectDate: _onSelectDate,
  todayCustomTarget,
}: NarrowLayoutProps) {
  const today = getLocalDate()
  const isToday = selectedDate === today

  const {
    status,
    events,
    loading,
    addEntry,
    addEntryPair,
    editEntry,
    deleteEntry,
    deletePair,
  } = usePunchData(selectedDate)

  const liveMinutes = isToday ? Math.floor((status?.workingSecondsToday ?? 0) / 60) : 0

  const { adjustedTargetMinutes } = useWeeklyTarget(
    liveMinutes,
    todayCustomTarget,
    isToday ? (status?.workWindow?.start ?? null) : null
  )

  const headerDate = formatDateDisplay(selectedDate)

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="scrollbar-hide flex flex-1 flex-col overflow-y-auto">
        {(loading || !status) && (
          <>
            <header className="sticky top-0 z-10 h-16 bg-background/50 backdrop-blur-md border-b border-border/30"/>
            <div className="flex flex-col gap-4 px-5 pt-2 pb-5">
              <PortalCardsSkeleton />
            </div>
          </>
        )}
        {!loading && status && (<>
        <header className="sticky top-0 z-10 px-5 pt-4 pb-2 bg-background/50 backdrop-blur-md border-b border-border/30">
          <div className="flex items-center justify-between">
            {/* Date */}
            <div className="flex items-center gap-1">
              <HugeiconsIcon
                icon={Calendar02Icon}
                size={15}
                className="shrink-0"
              />
              {/* If today then show "Today" */}
              <span className="text-sm font-medium tracking-tight text-muted-foreground">
                {isToday ? (
                  <>
                    <span className="flex gap-1.5">
                      <span className="text-foreground">Today</span>
                      <span className="font-bold">&middot;</span>
                      <span>
                        {new Date().toLocaleString("en-GB", {
                          weekday: "long",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </span>
                  </>
                ) : (
                  headerDate
                )}
              </span>
              {!isToday && (
                <Badge variant="outline" className="ml-1 text-muted-foreground">
                  Past data
                </Badge>
              )}
            </div>
            {/* Right: balance chips */}
            <div className="flex items-center gap-2">
              <NarrowBalanceChips />
            </div>
          </div>
        </header>

        <div className="flex flex-col gap-4 px-5 pt-2 pb-5">
          <div className="shrink-0">
            <PortalSection
              date={selectedDate}
              todayCustomTarget={isToday ? todayCustomTarget : null}
              workWindowStart={isToday ? (status?.workWindow?.start ?? null) : null}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Local
            </h2>
            <div className="h-px flex-1 bg-border/50" />
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-3">
            <StatusCard status={status} />
            <TotalCard
              totalSeconds={status.totalSecondsToday}
              workingSeconds={
                status.workMode !== "all" ? status.workingSecondsToday : undefined
              }
              isIn={status.isIn}
              breakSeconds={computeLocalBreakSeconds(
                events,
                status.workWindow,
                status.workMode
              )}
              targetMinutes={isToday ? adjustedTargetMinutes : 480}
            />
          </div>

          <div className="shrink-0">
            <ManualEntry date={selectedDate} onAddEntry={addEntry} onAddEntryPair={addEntryPair} />
          </div>

          <EventLog
            entries={events}
            workWindow={status.workWindow}
            workMode={status.workMode}
            onDelete={deleteEntry}
            onDeletePair={deletePair}
            onEdit={editEntry}
          />
        </div>
        </>)}
      </div>
    </div>
  )
}

// ── Wide layout: receives all shared state as props ──

interface WideLayoutProps {
  selectedDate: string
  onSelectDate: (date: string) => void
  dayMarks: Map<string, import("@/lib/week-utils").DayMark>
  onCycleMark: (date: string) => void
  onSetMark: (
    date: string,
    mark: import("@/lib/week-utils").DayMark | null
  ) => void
  workWindows: Map<string, import("@/lib/types").DayWorkWindow>
  onSetWorkWindow: (
    date: string,
    startTime: string,
    endTime: string,
    source?: "nightshift" | "manual" | "disabled"
  ) => void
  onDeleteWorkWindow: (date: string) => void
  nightShift: import("@/lib/types").NightShiftConfig
  dayTargets: Map<string, import("@/lib/types").DayTarget>
  onSetTarget: (date: string, type: import("@/lib/types").DayTargetType, value: string | null) => Promise<void>
  onDeleteTarget: (date: string) => Promise<void>
}

function WideLayout({
  selectedDate,
  onSelectDate,
  dayMarks,
  onCycleMark,
  onSetMark,
  workWindows,
  onSetWorkWindow,
  onDeleteWorkWindow,
  nightShift,
  dayTargets,
  onSetTarget,
  onDeleteTarget,
}: WideLayoutProps) {
  const weekRange = getWeekRange(selectedDate)
  const weekDays = getDaysOfWeek(weekRange.start)
  const { summaries } = usePortalRange(weekDays)
  const { connected: portalConnected } = usePortalStoreContext()
  const today = getLocalDate()
  const todayCustomTarget = dayTargets.get(today) ?? null

  return (
    <div className="flex h-full bg-background">
      {/* Left panel — calendar + stats */}
      <aside className="scrollbar-hide relative flex min-w-0 flex-1 flex-col overflow-y-auto border-r border-border/50">
        <div className="shrink-0 px-5 pt-5 pb-3">
          <div
            className="flex items-center justify-between"
            data-tour="app-header"
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon
                icon={Timer02Icon}
                size={18}
                className="text-muted-foreground"
              />
              <h1 className="text-base font-semibold tracking-tight">
                Traccia
              </h1>
            </div>
            <SettingsDialog />
          </div>
        </div>

        <div className="px-5 pb-4">
          <WeeklyCalendar
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
            weekSummaries={summaries}
            dayMarks={dayMarks}
            onSetMark={onSetMark}
            workWindows={workWindows}
            onSetWorkWindow={onSetWorkWindow}
            onDeleteWorkWindow={onDeleteWorkWindow}
            nightShift={nightShift}
            dayTargets={dayTargets}
            onSetTarget={onSetTarget}
            onDeleteTarget={onDeleteTarget}
          />
        </div>

        <div className="mx-5 h-px bg-border/50" />

        <div className="flex-1 px-5 py-4" data-tour="keyboard-nav">
          <WeeklyStats
            weekSummaries={summaries}
            selectedDate={selectedDate}
            dayMarks={dayMarks}
            onCycleMark={onCycleMark}
          />
        </div>

        {/* Portal blur overlay */}
        {!portalConnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-[3px]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/40">
              <HugeiconsIcon
                icon={Globe02Icon}
                size={24}
                className="text-muted-foreground/60"
              />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground/70">
                Portal data unavailable
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground/70">
                Connect via the Portal section →
              </p>
            </div>
          </div>
        )}
      </aside>

      {/* Right panel — day view */}
      <main className="flex w-[480px] shrink-0 flex-col overflow-hidden">
        <DayView date={selectedDate} showHeader todayCustomTarget={todayCustomTarget} />
      </main>
    </div>
  )
}

// ── Ultra-wide layout: month + week + day ──

function UltraWideLayout({
  selectedDate,
  onSelectDate,
  dayMarks,
  onCycleMark,
  onSetMark,
  workWindows,
  onSetWorkWindow,
  onDeleteWorkWindow,
  nightShift,
  dayTargets,
  onSetTarget,
  onDeleteTarget,
}: WideLayoutProps) {
  const yearMonth = getYearMonth(selectedDate)
  const weekRange = getWeekRange(selectedDate)
  const today = getLocalDate()
  const todayCustomTarget = dayTargets.get(today) ?? null
  const monthDays = getWeekdaysInMonth(yearMonth, today)
  const weekDays = getDaysOfWeek(weekRange.start)
  const { summaries: monthSummaries } = usePortalRange(monthDays)
  const { summaries: weekSummaries } = usePortalRange(weekDays)
  const { connected: portalConnected } = usePortalStoreContext()

  return (
    <div className="flex h-full bg-background">
      {/* Left — monthly calendar + insights */}
      <aside className="scrollbar-hide relative flex w-[300px] shrink-0 flex-col overflow-y-auto border-r border-border/50">
        <div className="shrink-0 px-4 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HugeiconsIcon
                icon={Timer02Icon}
                size={18}
                className="text-muted-foreground"
              />
              <h1 className="text-base font-semibold tracking-tight">
                Traccia
              </h1>
            </div>
            <SettingsDialog />
          </div>
        </div>

        <div className="px-4 pb-3">
          <MonthlyCalendar
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
            monthSummaries={monthSummaries}
            dayMarks={dayMarks}
            onSetMark={onSetMark}
            workWindows={workWindows}
            onSetWorkWindow={onSetWorkWindow}
            onDeleteWorkWindow={onDeleteWorkWindow}
            nightShift={nightShift}
            dayTargets={dayTargets}
            onSetTarget={onSetTarget}
            onDeleteTarget={onDeleteTarget}
          />
        </div>

        <div className="mx-4 h-px bg-border/50" />

        <div className="flex-1 px-4 py-3">
          <MonthlyInsights
            monthSummaries={monthSummaries}
            selectedDate={selectedDate}
            dayMarks={dayMarks}
            onSelectDate={onSelectDate}
          />
        </div>

        {/* Portal blur overlay */}
        {!portalConnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-[3px]">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/40">
              <HugeiconsIcon
                icon={Globe02Icon}
                size={22}
                className="text-muted-foreground/60"
              />
            </div>
            <div className="px-4 text-center">
              <p className="text-sm font-medium text-foreground/70">
                Monthly data
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground/70">
                Connect to portal to view
              </p>
            </div>
          </div>
        )}
      </aside>

      {/* Middle — weekly calendar + stats */}
      <section className="scrollbar-hide relative flex min-w-0 flex-1 flex-col overflow-y-auto border-r border-border/50">
        <div className="px-5 pt-5 pb-4">
          <WeeklyCalendar
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
            weekSummaries={weekSummaries}
            dayMarks={dayMarks}
            onSetMark={onSetMark}
            workWindows={workWindows}
            onSetWorkWindow={onSetWorkWindow}
            onDeleteWorkWindow={onDeleteWorkWindow}
            nightShift={nightShift}
            dayTargets={dayTargets}
            onSetTarget={onSetTarget}
            onDeleteTarget={onDeleteTarget}
          />
        </div>

        <div className="mx-5 h-px bg-border/50" />

        <div className="flex-1 px-5 py-4">
          <WeeklyStats
            weekSummaries={weekSummaries}
            selectedDate={selectedDate}
            dayMarks={dayMarks}
            onCycleMark={onCycleMark}
          />
        </div>

        {/* Portal blur overlay */}
        {!portalConnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-[3px]">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/40">
              <HugeiconsIcon
                icon={Globe02Icon}
                size={22}
                className="text-muted-foreground/60"
              />
            </div>
            <div className="px-4 text-center">
              <p className="text-sm font-medium text-foreground/70">
                Weekly stats
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground/70">
                Connect to portal to view
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Right — day view */}
      <main className="flex w-[480px] shrink-0 flex-col overflow-hidden">
        <DayView date={selectedDate} showHeader todayCustomTarget={todayCustomTarget} />
      </main>
    </div>
  )
}

// ── Green edge glow when 40h weekly target is complete ──

function WeeklyCompleteGlow({ visible }: { visible: boolean }) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-50 transition-opacity duration-[2000ms]",
        visible ? "opacity-100" : "opacity-0"
      )}
      style={{
        boxShadow:
          "inset 0 0 0 1px rgba(74,222,128,0.3), inset 0 0 120px rgba(74,222,128,0.07)",
      }}
    />
  )
}

// ── AppInner: inside PortalStoreProvider, computes weekly glow signal ──

interface AppInnerProps {
  isUltraWide: boolean
  isWide: boolean
  activePage: Page
  selectedDate: string
  onSelectDate: (date: string) => void
  dayMarks: Map<string, import("@/lib/week-utils").DayMark>
  onCycleMark: (date: string) => void
  onSetMark: (
    date: string,
    mark: import("@/lib/week-utils").DayMark | null
  ) => void
  workWindows: Map<string, import("@/lib/types").DayWorkWindow>
  onSetWorkWindow: (
    date: string,
    startTime: string,
    endTime: string,
    source?: "nightshift" | "manual" | "disabled"
  ) => void
  onDeleteWorkWindow: (date: string) => void
  nightShift: import("@/lib/types").NightShiftConfig
  dayTargets: Map<string, import("@/lib/types").DayTarget>
  onSetTarget: (date: string, type: import("@/lib/types").DayTargetType, value: string | null) => Promise<void>
  onDeleteTarget: (date: string) => Promise<void>
}

function AppInner({
  isUltraWide,
  isWide,
  activePage,
  selectedDate,
  onSelectDate,
  dayMarks,
  onCycleMark,
  onSetMark,
  workWindows,
  onSetWorkWindow,
  onDeleteWorkWindow,
  nightShift,
  dayTargets,
  onSetTarget,
  onDeleteTarget,
}: AppInnerProps) {
  const today = getLocalDate()
  const todayCustomTarget = dayTargets.get(today) ?? null
  const { cache } = usePortalStoreContext()
  const todayPortalData = cache[today]?.data
  const todayLiveMinutes = todayPortalData?.success ? todayPortalData.totalMinutes : 0
  const todayWorkWindowStart = workWindows.get(today)?.start_time ?? null
  const { weeklyComplete } = useWeeklyTarget(todayLiveMinutes, todayCustomTarget, todayWorkWindowStart)

  const homeLayoutProps = {
    selectedDate,
    onSelectDate,
    dayMarks,
    onCycleMark,
    onSetMark,
    workWindows,
    onSetWorkWindow,
    onDeleteWorkWindow,
    nightShift,
    dayTargets,
    onSetTarget,
    onDeleteTarget,
  }

  return (
    <>
      <WeeklyCompleteGlow visible={weeklyComplete} />
      {isUltraWide ? (
        activePage === "home" ? (
          <UltraWideLayout {...homeLayoutProps} />
        ) : (
          <EodPage />
        )
      ) : isWide ? (
        activePage === "home" ? (
          <WideLayout {...homeLayoutProps} />
        ) : (
          <EodPage />
        )
      ) : (
        <NarrowLayout selectedDate={selectedDate} onSelectDate={onSelectDate} todayCustomTarget={todayCustomTarget} />
      )}
    </>
  )
}

// ── Root: owns all shared state, survives layout transitions ──

export default function App() {
  const { width } = useWindowSize()
  const isUltraWide = width >= ULTRA_WIDE_BREAKPOINT
  const isWide = width >= WIDE_BREAKPOINT
  const [selectedDate, setSelectedDate] = useState(getLocalDate())
  const [activePage, setActivePage] = useState<Page>("home")
  const { dayMarks, cycleMark, setMark } = useDayMarks()
  const { workWindows, setWorkWindow, deleteWorkWindow } = useWorkWindows()
  const { dayTargets, setTarget, deleteTarget } = useDayTargets()
  const { settings: generalSettings } = useGeneralSettings()
  const nightShift = {
    enabled: generalSettings.nightShiftEnabled,
    start: generalSettings.nightShiftStart,
    end: generalSettings.nightShiftEnd,
  }

  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [playgroundDate, setPlaygroundDate] = useState<string | null>(null)
  const pendingSettings = useRef(false)
  const pendingPage = useRef<Page | null>(null)
  const prevIsWide = useRef(isWide)

  useEffect(() => {
    const handler = () => setSelectedDate(getLocalDate())
    window.addEventListener("traccia:go-today", handler)
    return () => window.removeEventListener("traccia:go-today", handler)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ date: string }>).detail
      if (detail?.date) setPlaygroundDate(detail.date)
    }
    window.addEventListener("traccia:open-playground", handler)
    return () => window.removeEventListener("traccia:open-playground", handler)
  }, [])

  useEffect(() => {
    const wasWide = prevIsWide.current
    prevIsWide.current = isWide
    if (!wasWide && isWide && pendingSettings.current) {
      pendingSettings.current = false
      window.dispatchEvent(new CustomEvent("traccia:open-settings"))
    }
    if (!wasWide && isWide && pendingPage.current) {
      setActivePage(pendingPage.current)
      pendingPage.current = null
    }
    if (wasWide && !isWide) {
      setSelectedDate(getLocalDate())
    }
  }, [isWide])

  useHotkeyBehavior()

  useAppShortcuts({
    "toggle-window-size": () => {
      if (isElectron) window.electronAPI.windowToggleSize()
    },
    "open-settings": () => {
      if (!isWide) {
        pendingSettings.current = true
        if (isElectron) window.electronAPI.windowToggleSize()
      } else {
        window.dispatchEvent(new CustomEvent("traccia:toggle-settings"))
      }
    },
    "day-prev": () => {
      if (activePage !== "home") return
      setSelectedDate((current) => {
        const d = new Date(current + "T00:00:00")
        d.setDate(d.getDate() - 1)
        const next = d.toLocaleDateString("en-CA")
        if (!isWide) {
          const today = getLocalDate()
          if (next < getWeekRange(today).start) return current
        }
        return next
      })
    },
    "day-next": () => {
      if (activePage !== "home") return
      setSelectedDate((current) => {
        const d = new Date(current + "T00:00:00")
        d.setDate(d.getDate() + 1)
        const next = d.toLocaleDateString("en-CA")
        if (!isWide) {
          const today = getLocalDate()
          if (next > today) return current
        }
        return next
      })
    },
    "go-today": () => setSelectedDate(getLocalDate()),
    "open-shortcuts": () => {
      window.dispatchEvent(new CustomEvent("traccia:open-shortcuts"))
    },
    "close-window": () => {
      if (document.querySelector('[role="dialog"],[role="alertdialog"]')) return
      if (isElectron) window.electronAPI.windowHide()
    },
    "nav-home": () => {
      if (!isWide) { pendingPage.current = "home"; if (isElectron) window.electronAPI.windowToggleSize() }
      else setActivePage("home")
    },
    "nav-eod": () => {
      if (!isWide) { pendingPage.current = "eod"; if (isElectron) window.electronAPI.windowToggleSize() }
      else setActivePage("eod")
    },
    "week-prev": () => {
      if (!isWide || activePage !== "home") return
      setSelectedDate((current) => {
        const d = new Date(current + "T00:00:00")
        d.setDate(d.getDate() - 7)
        return d.toLocaleDateString("en-CA")
      })
    },
    "week-next": () => {
      if (!isWide || activePage !== "home") return
      setSelectedDate((current) => {
        const d = new Date(current + "T00:00:00")
        d.setDate(d.getDate() + 7)
        return d.toLocaleDateString("en-CA")
      })
    },
  })

  return (
    <TooltipProvider>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <PortalStoreProvider>
        <AppUpdater />
        <AppNotifications />
        <OnboardingController isWide={isWide} />
        <ReleaseNotesController />
        <div className="flex h-screen flex-col overflow-hidden bg-background">
          <TitleBar
            isWide={isWide}
            activePage={activePage}
            onPageChange={setActivePage}
          />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <AppInner
              isUltraWide={isUltraWide}
              isWide={isWide}
              activePage={activePage}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              dayMarks={dayMarks}
              onCycleMark={cycleMark}
              onSetMark={setMark}
              workWindows={workWindows}
              onSetWorkWindow={(date, start, end, source) =>
                setWorkWindow(date, start, end, source || "manual")
              }
              onDeleteWorkWindow={deleteWorkWindow}
              nightShift={nightShift}
              dayTargets={dayTargets}
              onSetTarget={setTarget}
              onDeleteTarget={deleteTarget}
            />
            {playgroundDate && (
              <PlaygroundOverlay
                date={playgroundDate}
                onClose={() => setPlaygroundDate(null)}
              />
            )}
          </div>
          <StatusBar />
        </div>
        <LicenseMonitor />
      </PortalStoreProvider>
      <Toaster />
    </TooltipProvider>
  )
}
