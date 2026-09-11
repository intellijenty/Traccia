import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useGeneralSettings } from "@/hooks/use-general-settings"

export function StepWorkHours() {
  const { settings, save, loading } = useGeneralSettings()

  if (loading)
    return <div className="h-32 animate-pulse rounded-lg bg-muted/30" />

  const hasBoundary = !!settings.workBoundaryStart && !!settings.workBoundaryEnd

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Define your work boundary so Traccia can accurately filter out working
        sessions and calculate accurate working time.
        <br />{" "}
        <span className="bold text-foreground">
          Recommended if you open your PC outside working hours.
        </span>{" "}
        <br /> Ex. My standard working window will be between 9:00 AM to 9:30
        PM.
      </p>

      <div className="space-y-3 rounded-lg border border-border/40 bg-muted/20 p-3.5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium">Enable work boundary</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/60">
              Set your earliest start and latest end time
            </p>
          </div>
          <Switch
            checked={hasBoundary}
            onCheckedChange={(checked) =>
              save({
                ...settings,
                workBoundaryStart: checked ? "09:00" : "",
                workBoundaryEnd: checked ? "21:30" : "",
              })
            }
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
              <span className="mt-5 text-xs text-muted-foreground/40">to</span>
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
          </div>
        )}
      </div>

      {/* {hasBoundary && (
        <div className="space-y-3 rounded-lg border border-border/40 bg-muted/20 p-3.5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium">Night shift</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                Enable if you work night shifts
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
            <div className="flex items-center gap-3 border-t border-border/30 pt-3">
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
              <span className="mt-5 text-xs text-muted-foreground/40">to</span>
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
          )}
        </div>
      )} */}
    </div>
  )
}
