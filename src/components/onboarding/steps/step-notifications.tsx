import { Switch } from "@/components/ui/switch"
import { useNotificationSettings } from "@/hooks/use-notification-settings"

export function StepNotifications() {
  const { prefs, save, loading } = useNotificationSettings()

  if (loading)
    return <div className="h-32 animate-pulse rounded-lg bg-muted/30" />

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Get notified when you hit your daily target or when it's time to wrap
        up. You can fine-tune timing and messages in Settings later.
      </p>

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border/40 bg-muted/20 px-3.5 py-3">
          <div>
            <p className="text-xs font-medium">Daily target alert</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/60">
              Notify when you complete your 8-hour target
            </p>
          </div>
          <Switch
            checked={prefs.targetEnabled}
            onCheckedChange={(checked) => save({ targetEnabled: checked })}
            size="sm"
            className="mt-0.5 shrink-0"
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-border/40 bg-muted/20 px-3.5 py-3">
          <div>
            <p className="text-xs font-medium">EOD reminder</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/60">
              Reminder a few minutes before your work day ends
            </p>
          </div>
          <Switch
            checked={prefs.eodEnabled}
            onCheckedChange={(checked) => save({ eodEnabled: checked })}
            size="sm"
            className="mt-0.5 shrink-0"
          />
        </div>
      </div>
    </div>
  )
}
