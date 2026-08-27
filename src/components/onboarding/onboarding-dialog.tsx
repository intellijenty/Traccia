import { useState, useCallback } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { StepWelcome } from "./steps/step-welcome"
import { StepPortal } from "./steps/step-portal"
import { StepWorkHours } from "./steps/step-work-hours"
import { StepNotifications } from "./steps/step-notifications"
import { StepHotkey } from "./steps/step-hotkey"
import { StepComplete } from "./steps/step-complete"
import { usePortalStoreContext } from "@/contexts/portal-store"
import { useGeneralSettings } from "@/hooks/use-general-settings"
import { useNotificationSettings } from "@/hooks/use-notification-settings"
import { useHotkeySettings } from "@/hooks/use-hotkey-settings"

type StepId = "welcome" | "portal" | "work-hours" | "notifications" | "hotkey" | "complete"

const STEPS: StepId[] = ["welcome", "portal", "work-hours", "notifications", "hotkey", "complete"]

const SKIPPABLE: StepId[] = ["portal", "work-hours", "notifications", "hotkey"]

interface OnboardingDialogProps {
  open: boolean
  onComplete: () => void
}

export function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)

  const { status: portalStatus } = usePortalStoreContext()
  const { settings: generalSettings } = useGeneralSettings()
  const { prefs } = useNotificationSettings()
  const { settings: hotkeySettings } = useHotkeySettings()

  const currentStep = STEPS[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = currentStep === "complete"
  const canSkip = SKIPPABLE.includes(currentStep)

  const goNext = useCallback(() => {
    if (isLast) {
      onComplete()
      return
    }
    setDirection(1)
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
  }, [isLast, onComplete])

  const goBack = useCallback(() => {
    setDirection(-1)
    setStepIndex((i) => Math.max(i - 1, 0))
  }, [])

  const handlePortalConnected = useCallback(() => {
    // Auto-advance after successful portal connection
    setTimeout(goNext, 800)
  }, [goNext])

  const portalConnected = portalStatus.connected || portalStatus.hasCredentials
  const workHoursSet = !!generalSettings.workBoundaryStart && !!generalSettings.workBoundaryEnd
  const notificationsEnabled = prefs.targetEnabled || prefs.eodEnabled
  const hotkeyEnabled = hotkeySettings.enabled

  function renderStep() {
    switch (currentStep) {
      case "welcome":
        return <StepWelcome />
      case "portal":
        return <StepPortal onConnected={handlePortalConnected} />
      case "work-hours":
        return <StepWorkHours />
      case "notifications":
        return <StepNotifications />
      case "hotkey":
        return <StepHotkey />
      case "complete":
        return (
          <StepComplete
            portalConnected={portalConnected}
            workHoursSet={workHoursSet}
            notificationsEnabled={notificationsEnabled}
            hotkeyEnabled={hotkeyEnabled}
          />
        )
    }
  }

  return (
    <Dialog open={open} modal>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        className="sm:max-w-lg gap-0 p-0 overflow-hidden"
        overlayBlur="supports-backdrop-filter:backdrop-blur-2xl"
      >
        {/* Step indicator */}
        <div className="flex items-center justify-between border-b border-border/30 px-6 py-3">
          <div className="flex items-center gap-1.5">
            {STEPS.map((step, i) => (
              <div
                key={step}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i < stepIndex
                    ? "w-4 bg-primary/60"
                    : i === stepIndex
                      ? "w-4 bg-primary"
                      : "w-1.5 bg-muted/50"
                )}
              />
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {stepIndex + 1} of {STEPS.length}
          </span>
        </div>

        {/* Step content */}
        <div className="scrollbar-hide overflow-y-auto px-6 py-5" style={{ minHeight: 260, maxHeight: 380 }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: direction * 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -16 }}
              transition={{ duration: 0.18, ease: "easeInOut" }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/30 px-6 py-3">
          <div>
            {!isFirst && currentStep !== "complete" && (
              <Button variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={goBack}>
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canSkip && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={goNext}
              >
                Skip
              </Button>
            )}
            <Button size="sm" className="h-8 px-4 text-xs" onClick={goNext}>
              {isFirst ? "Get Started" : isLast ? "Start Exploring" : "Next"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
