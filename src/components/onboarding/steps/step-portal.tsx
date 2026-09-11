import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircle02Icon, Globe02Icon } from "@hugeicons/core-free-icons"
import { HrmsLoginForm } from "@/components/hrms-login-form"
import { usePortalStoreContext } from "@/contexts/portal-store"

interface StepPortalProps {
  onConnected: () => void
}

export function StepPortal({ onConnected }: StepPortalProps) {
  const { login, status } = usePortalStoreContext()
  const alreadyConnected = status.connected || status.hasCredentials

  if (alreadyConnected) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={24}
            className="text-emerald-400"
          />
        </div>
        <div>
          <p className="text-sm font-medium">Connected to Portal</p>
          {status.userName && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {status.userName}
            </p>
          )}
        </div>
        <p className="max-w-xs text-xs text-muted-foreground/60">
          Portal is ready. Weekly stats, monthly insights, and punch data will
          sync automatically.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-border/30 bg-muted/20 px-3.5 py-3">
        <HugeiconsIcon
          icon={Globe02Icon}
          size={16}
          className="mt-0.5 shrink-0 text-muted-foreground/60"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Connect with Portal to view weekly stats, monthly insights, and portal
          punch data.
        </p>
      </div>
      <HrmsLoginForm onLogin={login} onSuccess={onConnected} />
    </div>
  )
}
