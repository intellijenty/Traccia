import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle02Icon,
  Globe02Icon,
  Clock01Icon,
  Notification01Icon,
  KeyboardIcon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Button } from "@/components/ui/button"

interface StepCompleteProps {
  portalConnected: boolean
  workHoursSet: boolean
  notificationsEnabled: boolean
  hotkeyEnabled: boolean
}

function ConfigItem({
  icon,
  label,
  done,
}: {
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"]
  label: string
  done: boolean
}) {
  return (
    <div className="flex items-center gap-2.5">
      <HugeiconsIcon
        icon={icon}
        size={14}
        className={done ? "text-foreground" : "text-muted-foreground/30"}
      />
      <span
        className={cn(
          "text-xs",
          done ? "text-foreground" : "text-muted-foreground/40"
        )}
      >
        {label}
      </span>
      {done && (
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          size={12}
          className="ml-auto text-emerald-400/70"
        />
      )}
    </div>
  )
}

export function StepComplete({
  portalConnected,
  workHoursSet,
  notificationsEnabled,
  hotkeyEnabled,
}: StepCompleteProps) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-2xl font-bold tracking-tight">You're all set 🎉</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Traccia is ready. Here's what you configured:
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-border/40 bg-muted/20 p-3.5">
        <ConfigItem
          icon={Globe02Icon}
          label="HRMS Portal"
          done={portalConnected}
        />
        <ConfigItem icon={Clock01Icon} label="Work Hours" done={workHoursSet} />
        <ConfigItem
          icon={Notification01Icon}
          label="Notifications"
          done={notificationsEnabled}
        />
        <ConfigItem
          icon={KeyboardIcon}
          label="Global Hotkey"
          done={hotkeyEnabled}
        />
      </div>

      <div className="space-y-2">
        <p>
          Press{" "}
          <KbdGroup>
            <Kbd>Shift</Kbd>
            <span>+</span>
            <Kbd>?</Kbd>
          </KbdGroup>{" "}
          anytime to view the list of keyboard shortcuts or open app manual.
        </p>
        {/* user manual reference */}
        <p>
          Refer to the
          <Button
            variant={"link"}
            size={"xs"}
            className="text-muted-foreground"
            onClick={() => {
              const url = "https://traccia.notion.site/manual"
              if (
                typeof window !== "undefined" &&
                window.electronAPI?.openExternal
              ) {
                window.electronAPI.openExternal(url)
              } else {
                window.open(url, "_blank")
              }
            }}
          >
            <HugeiconsIcon icon={LinkSquare02Icon} size={13} className="mr-1" />
            App Manual
          </Button>
          for detailed guides on using Traccia (Recommended).
        </p>
      </div>

      {!portalConnected && (
        <p className="text-center text-[11px] text-muted-foreground/50">
          Connect to HRMS Portal later from the Portal section to unlock full
          insights.
        </p>
      )}
    </div>
  )
}
