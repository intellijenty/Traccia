import { cn } from '@/lib/utils'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Progress } from '@/components/ui/progress'
import {
  useClaudeUsage,
  formatCountdown,
  formatResetDay,
  formatRelativeTime,
  type ClaudeUsageData,
} from '@/hooks/use-claude-usage'

type UsageProps = { data: ClaudeUsageData | null; error: string | null; loading: boolean }

// ── Claude icon ────────────────────────────────────────────────────────────────

function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('fill-current', className)}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  )
}

// ── Usage row inside hover card ────────────────────────────────────────────────

function UsageRow({
  label,
  utilization,
  resetLabel,
  resetSub,
}: {
  label: string
  utilization: number
  resetLabel: string
  resetSub: string
}) {
  const pct = Math.round(utilization)
  const isHigh = pct >= 80
  const isMed = pct >= 50 && pct < 80

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-muted-foreground/70 uppercase">
          {label}
        </span>
        <span
          className={cn(
            'text-xs font-semibold tabular-nums',
            isHigh ? 'text-destructive' : isMed ? 'text-[#d97757]' : 'text-foreground/80'
          )}
        >
          {pct}%
        </span>
      </div>

      <Progress
        value={pct}
        className={cn(
          'h-[5px] bg-muted/50',
          isHigh
            ? '[&>[data-slot=progress-indicator]]:bg-destructive'
            : isMed
              ? '[&>[data-slot=progress-indicator]]:bg-[#d97757]'
              : '[&>[data-slot=progress-indicator]]:bg-[#d97757]'
        )}
      />

      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-muted-foreground/60">{resetLabel}</span>
        <span className="text-[10px] text-muted-foreground/40">{resetSub}</span>
      </div>
    </div>
  )
}

// ── Hover card content ─────────────────────────────────────────────────────────

function ClaudeUsageCard({ data, error, loading }: UsageProps) {
  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-1">
          <div className="flex h-5 w-5 items-center justify-center">
            <ClaudeIcon className="size-3.5 text-[#d97757]" />
          </div>
          <span className="text-xs font-semibold text-foreground/90">Claude Usage</span>
        </div>
        <span className="text-xs font-medium text-muted-foreground/50 uppercase tracking-wide">
          Team
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 px-4 py-4">
        {loading && !data && (
          <div className="flex items-center justify-center py-4">
            <span className="text-[11px] text-muted-foreground/40">Loading…</span>
          </div>
        )}

        {error && !data && (
          <div className="flex flex-col gap-1 py-2">
            <span className="text-[11px] font-medium text-muted-foreground/60">
              Unable to fetch usage
            </span>
            <span className="text-[10px] text-muted-foreground/40">{error}</span>
          </div>
        )}

        {data && (
          <>
            <UsageRow
              label="Session"
              utilization={data.session.utilization}
              resetLabel={`Resets in ${formatCountdown(data.session.resetsAt)}`}
              resetSub="5-hour window"
            />
            <div className="h-px bg-border/30" />
            <UsageRow
              label="Weekly"
              utilization={data.weekly.utilization}
              resetLabel={`Resets ${formatResetDay(data.weekly.resetsAt)}`}
              resetSub="7-day window"
            />
          </>
        )}
      </div>

      {/* Footer */}
      {data && (
        <div className="border-t border-border/30 px-4 py-2">
          <span className="text-[10px] text-muted-foreground/35">
            Updated {formatRelativeTime(data.fetchedAt)}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Claude usage chip ──────────────────────────────────────────────────────────

function ClaudeUsageChip({ data, error, loading }: UsageProps) {
  const sessionPct = data ? Math.round(data.session.utilization) : null
  const countdown = data ? formatCountdown(data.session.resetsAt) : null

  const chipText =
    loading && !data
      ? '...'
      : error && !data
        ? '— · —'
        : sessionPct !== null
          ? `${sessionPct}% · ${countdown}`
          : '—'

  const isError = Boolean(error && !data)
  const isHigh = data ? data.session.utilization >= 80 : false
  const isMed = data ? data.session.utilization >= 50 : false

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          className={cn(
            'flex h-full items-center gap-1.5 rounded-sm px-2.5 text-[12px] font-medium tabular-nums transition-colors duration-100',
            'hover:bg-muted/50',
            isError
              ? 'text-muted-foreground/30'
              : isHigh
                ? 'text-destructive/70 hover:text-destructive'
                : isMed
                  ? 'text-[#d97757]/70 hover:text-[#d97757]'
                  : 'text-muted-foreground/60 hover:text-muted-foreground/80'
          )}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <ClaudeIcon className={cn('h-3 w-3 shrink-0', isError ? 'opacity-20' : 'opacity-90')} />
          {chipText}
        </button>
      </HoverCardTrigger>

      <HoverCardContent side="top" align="start" sideOffset={6} className="w-64 p-0 overflow-hidden">
        <ClaudeUsageCard data={data} error={error} loading={loading} />
      </HoverCardContent>
    </HoverCard>
  )
}

// ── Status bar shell ───────────────────────────────────────────────────────────

export function StatusBar({ className }: { className?: string }) {
  const { data, error, loading } = useClaudeUsage()

  return (
    <div
      className={cn(
        'flex h-8 shrink-0 items-center justify-between border-t border-border/40 bg-background/95 px-1 select-none',
        className
      )}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left slot */}
      <div className="flex items-center">
        <ClaudeUsageChip data={data} error={error} loading={loading} />
      </div>

      {/* Right slot — reserved */}
      <div className="flex items-center" />
    </div>
  )
}
