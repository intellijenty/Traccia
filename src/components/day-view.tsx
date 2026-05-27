import { StatusCard } from "@/components/status-card"
import { TotalCard } from "@/components/total-card"
import { ManualEntry } from "@/components/manual-entry"
import { EventLog } from "@/components/event-log"
import { PortalSection } from "@/components/portal-section"
import { usePunchData } from "@/hooks/use-punch-data"
import { useWeeklyTarget } from "@/hooks/use-weekly-target"
import { formatDateDisplay, getLocalDate } from "@/lib/week-utils"
import { computeLocalBreakSeconds } from "@/lib/utils"
import { Badge } from "./ui/badge"

interface DayViewProps {
  date: string
  showHeader?: boolean
  todayCustomTarget?: import("@/lib/types").DayTarget | null
}

export function DayView({ date, showHeader = false, todayCustomTarget }: DayViewProps) {
  const today = getLocalDate()
  const isViewingToday = date === today

  const {
    status,
    events,
    loading,
    isToday,
    addEntry,
    addEntryPair,
    editEntry,
    deleteEntry,
    deletePair,
  } = usePunchData(date)

  const liveMinutes = isViewingToday ? Math.floor((status?.workingSecondsToday ?? 0) / 60) : 0

  const { adjustedTargetMinutes } = useWeeklyTarget(
    liveMinutes,
    isViewingToday ? todayCustomTarget : null,
    isViewingToday ? (status?.workWindow?.start ?? null) : null
  )

  if (loading || !status) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-sm text-muted-foreground">
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {showHeader && (
        <header className="shrink-0 border-b border-border/50 px-5 py-3 flex items-center gap-3">
          <p className="text-sm font-medium">{formatDateDisplay(date)}</p>
          {!isToday && (
            <Badge variant="outline" className="text-muted-foreground" >
              Past data
            </Badge>
          )}
        </header>
      )}

      <div className="scrollbar-hide flex flex-1 flex-col gap-4 overflow-y-auto px-5 pt-3 pb-5">
        {/* Portal */}
        <div className="shrink-0" data-tour="portal-section">
          <PortalSection
            date={date}
            variant="wide"
            todayCustomTarget={isViewingToday ? todayCustomTarget : null}
            workWindowStart={isViewingToday ? (status.workWindow?.start ?? null) : null}
          />
        </div>

        {/* Local divider */}
        <div className="flex shrink-0 items-center gap-2" data-tour="local-section">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Local
          </h2>
          <div className="h-px flex-1 bg-border/50" />
        </div>

        {/* Cards */}
        <div className="grid shrink-0 grid-cols-2 gap-3">
          <StatusCard status={status} />
          <TotalCard
            totalSeconds={status.totalSecondsToday}
            workingSeconds={status.workMode !== "all" ? status.workingSecondsToday : undefined}
            isIn={status.isIn}
            breakSeconds={computeLocalBreakSeconds(events, status.workWindow, status.workMode)}
            targetMinutes={isViewingToday ? adjustedTargetMinutes : 480}
          />
        </div>

        {/* Manual entry — hidden for future dates */}
        {date <= new Date().toLocaleDateString("en-CA") && (
          <div className="shrink-0" data-tour="manual-entry">
            <ManualEntry date={date} onAddEntry={addEntry} onAddEntryPair={addEntryPair} />
          </div>
        )}

        {/* Event log */}
        <EventLog
          entries={events}
          workWindow={status.workWindow}
          workMode={status.workMode}
          onDelete={deleteEntry}
          onDeletePair={deletePair}
          onEdit={editEntry}
        />
      </div>
    </div>
  )
}
