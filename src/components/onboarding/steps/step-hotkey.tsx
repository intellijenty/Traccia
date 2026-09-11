import { HotkeyRecorder } from "@/components/hotkey-recorder"
import { useHotkeySettings } from "@/hooks/use-hotkey-settings"
import { Switch } from "@/components/ui/switch"

export function StepHotkey() {
  const { settings, save, loading } = useHotkeySettings()

  if (loading)
    return <div className="h-32 animate-pulse rounded-lg bg-muted/30" />

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Set a global keyboard shortcut to summon Traccia from anywhere.
        <br />
        Even when it's minimized to tray or Window is closed.
      </p>

      <div className="space-y-3 rounded-lg border border-border/40 bg-muted/20 p-3.5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium">Enable global hotkey</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/60">
              Show Traccia window from any application
            </p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) =>
              save({ ...settings, enabled: checked })
            }
            size="sm"
            className="mt-0.5 shrink-0"
          />
        </div>

        {settings.enabled && (
          <div className="flex flex-col space-y-1 border-t border-border/30 pt-3">
            <label className="text-[11px] font-medium text-muted-foreground">
              Shortcut
            </label>
            <HotkeyRecorder
              value={settings.combo}
              defaultValue="Alt+Space"
              requireModifier
              onChange={(combo) => save({ ...settings, combo })}
            />
          </div>
        )}
      </div>
    </div>
  )
}
