import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { RefreshIcon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { usePortalStoreContext } from "@/contexts/portal-store"
import { getLocalDate } from "@/lib/week-utils"
import {
  formatDays,
  formatRange,
  initials,
  mergeLeaves,
  type MergedLeave,
} from "@/lib/people-today"
import type { BirthdayPerson, PeopleTodaySnapshot } from "@/lib/types"
import { cn } from "@/lib/utils"

const MAX_AVATARS = 3

function msUntilMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 1, 0)
  return midnight.getTime() - now.getTime()
}

function useToday(): string {
  const [today, setToday] = useState(getLocalDate)
  useEffect(() => {
    const timer = setTimeout(() => setToday(getLocalDate()), msUntilMidnight())
    return () => clearTimeout(timer)
  }, [today])
  return today
}

function usePeopleToday() {
  const [snapshot, setSnapshot] = useState<PeopleTodaySnapshot | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(() => {
    window.electronAPI.peopleTodayGet().then(setSnapshot)
  }, [])

  useEffect(() => {
    load()
    return window.electronAPI.onEventUpdate(load)
  }, [load])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const result = await window.electronAPI.peopleTodayRefresh()
      setSnapshot(result.snapshot)
      if (result.failed.length > 0) {
        toast.error("Couldn't refresh leave & birthdays")
      }
    } catch {
      toast.error("Couldn't refresh leave & birthdays")
    } finally {
      setRefreshing(false)
    }
  }, [])

  return { snapshot, refreshing, refresh }
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background",
        className
      )}
    >
      {initials(name)}
    </span>
  )
}

function AvatarStack({ names }: { names: string[] }) {
  const shown = names.slice(0, MAX_AVATARS)
  const extra = names.length - shown.length
  return (
    <span className="flex items-center -space-x-2">
      {shown.map((name, i) => (
        <Avatar key={`${name}-${i}`} name={name} />
      ))}
      {extra > 0 && (
        <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background">
          +{extra}
        </span>
      )}
    </span>
  )
}

interface TriggerProps {
  label: string
  names: string[] | null
  children: ReactNode
}

function PeopleTrigger({ label, names, children }: TriggerProps) {
  const summary = (
    <span
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-1.5 text-xs transition-colors",
        names && names.length > 0
          ? "cursor-default text-foreground hover:bg-muted/50"
          : "text-muted-foreground/50"
      )}
    >
      <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      {names && names.length > 0 && <AvatarStack names={names} />}
      <span className="font-mono tabular-nums">
        {names ? names.length : "—"}
      </span>
    </span>
  )

  if (!names || names.length === 0) return summary

  return (
    <HoverCard openDelay={120} closeDelay={150}>
      <HoverCardTrigger asChild>{summary}</HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-[26rem] p-3">
        <p className="px-3 pt-1 pb-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {label} · {names.length}
        </p>
        <ul className="scrollbar-hide max-h-[384px] overflow-y-auto">
          {children}
        </ul>
      </HoverCardContent>
    </HoverCard>
  )
}

function LeaveRow({ leave }: { leave: MergedLeave }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-muted/40">
      <Avatar name={leave.name} className="ring-0" />
      <span className="min-w-0 flex-1 truncate text-sm">{leave.name}</span>
      <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
        {leave.leaveName}
        {leave.portion && ` · ${leave.portion}`}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="w-10 shrink-0 cursor-default text-right font-mono text-xs text-muted-foreground/70 tabular-nums">
            {formatDays(leave.totalDays)}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex-col items-start gap-0.5">
          {leave.ranges.map((range) => (
            <span key={`${range.start}-${range.end}`}>
              {formatRange(range)}
            </span>
          ))}
        </TooltipContent>
      </Tooltip>
    </li>
  )
}

function BirthdayRow({ person }: { person: BirthdayPerson }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-muted/40">
      <Avatar name={person.name} className="ring-0" />
      <span className="min-w-0 flex-1 truncate text-sm">{person.name}</span>
    </li>
  )
}

export function PeopleTodayBar() {
  const { connected } = usePortalStoreContext()
  const { snapshot, refreshing, refresh } = usePeopleToday()
  const today = useToday()

  const leaves = useMemo(() => {
    const list = snapshot?.onLeave
    return list && list.date === today ? mergeLeaves(list.people, today) : null
  }, [snapshot, today])

  const birthdays = useMemo(() => {
    const list = snapshot?.birthdays
    return list && list.date === today
      ? [...list.people].sort((a, b) => a.name.localeCompare(b.name))
      : null
  }, [snapshot, today])

  const fetchedAt = [
    snapshot?.onLeave?.fetchedAt,
    snapshot?.birthdays?.fetchedAt,
  ]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)

  if (!connected) return null

  return (
    <div className="sticky bottom-0 flex shrink-0 items-center gap-4 border-t border-border/50 bg-background px-4 py-2.5">
      <PeopleTrigger
        label="On leave"
        names={leaves?.map((leave) => leave.name) ?? null}
      >
        {leaves?.map((leave) => (
          <LeaveRow key={leave.userId} leave={leave} />
        ))}
      </PeopleTrigger>
      <PeopleTrigger
        label="Birthdays"
        names={birthdays?.map((person) => person.name) ?? null}
      >
        {birthdays?.map((person) => (
          <BirthdayRow key={person.userId} person={person} />
        ))}
      </PeopleTrigger>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh leave and birthdays"
            className="ml-auto flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none"
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              size={14}
              className={cn(refreshing && "animate-spin")}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {fetchedAt
            ? `Refresh · updated ${new Date(fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : "Refresh"}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
