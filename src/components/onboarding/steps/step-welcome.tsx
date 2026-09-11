import { HugeiconsIcon } from "@hugeicons/react"
import { Timer02Icon } from "@hugeicons/core-free-icons"

export function StepWelcome() {
  return (
    <div className="flex flex-col items-center gap-6 py-2 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/30">
        <HugeiconsIcon
          icon={Timer02Icon}
          size={32}
          className="text-foreground"
        />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">
          Welcome to Traccia
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Traccia tracks PC logins and shows you insights on your work sessions.
          Let's get you set up in a couple of minutes.
        </p>
      </div>
      <div className="grid w-full grid-cols-3 gap-3">
        {[
          { label: "Local tracking", sub: "Automatic check In-out" },
          { label: "Portal sync", sub: "HRMS integration" },
          { label: "Weekly insights", sub: "Hours & balance" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2.5 text-center"
          >
            <p className="text-xs font-medium">{item.label}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground/60">
              {item.sub}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
