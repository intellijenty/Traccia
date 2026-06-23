import { PortalStatusCard } from "./portal-status-card"
import { PortalTotalCard } from "./portal-total-card"
import { PortalLog } from "./portal-log"
import { HrmsLogin } from "./hrms-login"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import { usePortalDay } from "@/hooks/use-portal-day"
import { useWeeklyTarget } from "@/hooks/use-weekly-target"
import { useDayMarks } from "@/hooks/use-day-marks"
import { getLocalDate } from "@/lib/week-utils"
import { relativeTime, computePortalBreakMinutes } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { Globe02Icon, SparklesIcon } from "@hugeicons/core-free-icons"
import { Card, CardContent } from "./ui/card"
import { Button } from "./ui/button"
import type { PortalEntry } from "@/lib/types"

// Skeleton that mirrors the real portal cards layout

export function PortalCardsSkeleton() {
  return (
    <>
      {/* Two cards row — matches grid grid-cols-2 gap-3 */}
      <div className="grid grid-cols-2 gap-3">
        {/* Status & Total card skeleton */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="h-60 rounded-4xl border border-card bg-muted/50 p-5"
          ></div>
        ))}
      </div>

      {/* Log skeleton */}
      <Card className="bg-background">
        <CardContent className="p-0">
          <div className="px-4">
            <Skeleton className="h-5 w-full rounded-full bg-card/30" />
          </div>
        </CardContent>
      </Card>
    </>
  )
}

// Main component

interface PortalSectionProps {
  date?: string
  variant?: "default" | "wide"
  todayCustomTarget?: import("@/lib/types").DayTarget | null
  workWindowStart?: string | null
}

export function PortalSection({
  date,
  variant = "default",
  todayCustomTarget,
  workWindowStart,
}: PortalSectionProps) {
  const {
    hrmsStatus,
    portalData,
    loading,
    syncing,
    error,
    lastRefreshed,
    login,
    logout,
    refresh,
  } = usePortalDay(date)

  const showControls = hrmsStatus.connected || hrmsStatus.hasCredentials
  const showSkeleton = loading && !portalData && showControls

  // Adjusted daily target — only meaningful when viewing today
  const today = getLocalDate()
  const isToday = (date ?? today) === today

  const { adjustedTargetMinutes, tooltipText: targetTooltip } = useWeeklyTarget(
    isToday ? (portalData?.totalMinutes ?? 0) : 0,
    todayCustomTarget,
    workWindowStart
  )

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Portal
        </h2>
        <div className="flex items-center gap-2">
          {showControls && hrmsStatus.userName && (
            <span className="text-xs text-muted-foreground">
              {hrmsStatus.userName}
            </span>
          )}
          {showControls && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => refresh()}
                  disabled={syncing || loading}
                  className="flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default"
                >
                  <span
                    className={`inline-block text-sm leading-none ${
                      syncing ? "animate-spin text-foreground/70" : ""
                    }`}
                    style={
                      syncing
                        ? {
                            animationTimingFunction: "linear",
                            animationDuration: "1.2s",
                          }
                        : undefined
                    }
                  >
                    ↻
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {syncing
                  ? "Syncing…"
                  : lastRefreshed
                    ? `Last updated: ${relativeTime(lastRefreshed)}`
                    : "Click to refresh"}
              </TooltipContent>
            </Tooltip>
          )}
          <HrmsLogin
            onLogin={login}
            onLogout={logout}
            connected={showControls}
          />
        </div>
      </div>

      {/* Not connected — compact (narrow layout) */}
      {!showControls && variant === "default" && (
        <div className="rounded-lg border border-dashed border-border/50 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Connect to HRMS portal to view punch data
          </p>
        </div>
      )}

      {/* Not connected — wide layout blur overlay */}
      {!showControls && variant === "wide" && (
        <div className="relative overflow-hidden rounded-xl">
          <div className="pointer-events-none space-y-3 opacity-40 blur-[2px] select-none">
            <div className="grid grid-cols-2 gap-3">
              <div className="h-18 rounded-lg bg-muted/60" />
              <div className="h-18 rounded-lg bg-muted/60" />
            </div>
            <div className="space-y-2 rounded-lg bg-muted/40 px-3 py-2.5">
              <div className="h-2.5 w-20 rounded-full bg-muted-foreground/20" />
              <div className="space-y-1.5 pt-1">
                {[0.85, 0.65, 0.75, 0.55].map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/15" />
                    <div
                      className="h-2 rounded-full bg-muted-foreground/15"
                      style={{ width: `${w * 100}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/75 backdrop-blur-[3px]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/40">
              <HugeiconsIcon
                icon={Globe02Icon}
                size={24}
                className="text-muted-foreground/70"
              />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground/80">
                HRMS Portal
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sign in to view attendance & punch data
              </p>
            </div>
            <HrmsLogin onLogin={login} onLogout={logout} connected={false} />
          </div>
        </div>
      )}

      {/* Skeleton — initial load only (no data yet) */}
      {showSkeleton && <PortalCardsSkeleton />}

      {/* Error */}
      {error && !portalData?.success && !showSkeleton && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {[
            "net::ERR_NAME_NOT_RESOLVED",
            "net::ERR_CONNECTION_TIMED_OUT",
          ].includes(error)
            ? "Unable to reach HRMS portal. Please check your client connection."
            : `Error: ${error}`}
        </div>
      )}

      {/* Connected with data */}
      {portalData?.success && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <PortalStatusCard
              isIn={portalData.isCurrentlyIn}
              lastInTime={portalData.lastInTime}
              totalMinutes={portalData.totalMinutes}
            />
            <PortalTotalCard
              totalMinutes={portalData.totalMinutes}
              isIn={portalData.isCurrentlyIn}
              targetMinutes={isToday ? adjustedTargetMinutes : 480}
              adjustmentLabel={isToday ? targetTooltip : null}
              breakMinutes={computePortalBreakMinutes(portalData.entries)}
            />
          </div>
          <PortalLog entries={portalData.entries} />
        </>
      )}

      {/* Fix miss-punch — shown for manual mp mark even before portal loads */}
      {showControls && (
        <FixMissPunchButton date={date ?? today} entries={portalData?.entries ?? []} />
      )}
    </div>
  )
}

// ── Fix miss-punch entry button ──
// Eligible when: a past day 1–7 days ago has an unpaired (open) punch.

function daysAgo(date: string): number {
  const today = getLocalDate()
  const a = new Date(today + "T00:00:00").getTime()
  const b = new Date(date + "T00:00:00").getTime()
  return Math.round((a - b) / 86400000)
}

function hasMissPunch(entries: PortalEntry[]): boolean {
  // A past-day entry with no out-time = dangling = miss-punch.
  return entries.some((e) => e.outtime === null)
}

function FixMissPunchButton({ date, entries }: { date: string; entries: PortalEntry[] }) {
  const { dayMarks } = useDayMarks()
  const ago = daysAgo(date)
  // Eligible on a real portal dangling punch OR a manual "mp" day-mark.
  const flagged = hasMissPunch(entries) || dayMarks.get(date) === "mp"
  const eligible = ago >= 1 && ago <= 7 && flagged
  if (!eligible) return null

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("traccia:open-playground", { detail: { date } })
        )
      }
    >
      <HugeiconsIcon icon={SparklesIcon} size={14} className="mr-1.5" />
      Fix miss-punch
    </Button>
  )
}
