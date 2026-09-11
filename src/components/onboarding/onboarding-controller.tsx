import { useState, useEffect, useRef, useCallback } from "react"
import { OnboardingDialog } from "./onboarding-dialog"
import { usePortalStoreContext } from "@/contexts/portal-store"

const isElectron = typeof window !== "undefined" && !!window.electronAPI

const CURRENT_ONBOARDING_VERSION = 1

interface OnboardingControllerProps {
  isWide: boolean
}

export function OnboardingController({ isWide }: OnboardingControllerProps) {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingCompleted, setOnboardingCompleted] = useState(true) // default true prevents flash
  const [loaded, setLoaded] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)

  const { connected } = usePortalStoreContext()
  const prevConnected = useRef(connected)
  // keep prevConnected in sync (unused after tour removal, but harmless)
  prevConnected.current = connected

  // Load initial state
  useEffect(() => {
    async function load() {
      let authorized = false
      let oc = true

      if (isElectron) {
        const [status, settings] = await Promise.all([
          window.licenseAPI.checkStatus(),
          window.electronAPI.getSettings(),
        ])
        authorized = status
        oc = settings.onboardingCompleted

        // Version bump re-trigger
        if (oc && settings.onboardingVersion < CURRENT_ONBOARDING_VERSION) {
          oc = false
          await window.electronAPI.updateSettings({
            onboardingCompleted: false,
            onboardingVersion: CURRENT_ONBOARDING_VERSION,
          } as Parameters<typeof window.electronAPI.updateSettings>[0])
        }
      } else {
        // Dev/browser: show onboarding for testing
        authorized = true
        oc = false
      }

      setIsAuthorized(authorized)
      setOnboardingCompleted(oc)
      setLoaded(true)

      // Already licensed + not onboarded → show immediately (restart recovery)
      if (authorized && !oc) {
        if (!isWide && isElectron) window.electronAPI.windowToggleSize()
        setTimeout(() => setShowOnboarding(true), 350)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // License activation event listener
  useEffect(() => {
    const handler = () => {
      setIsAuthorized(true)
      if (!onboardingCompleted) {
        if (!isWide && isElectron) window.electronAPI.windowToggleSize()
        setTimeout(() => setShowOnboarding(true), 350)
      }
    }
    window.addEventListener("traccia:license-activated", handler)
    return () =>
      window.removeEventListener("traccia:license-activated", handler)
  }, [isWide, onboardingCompleted])

  const handleOnboardingComplete = useCallback(async () => {
    setShowOnboarding(false)
    setOnboardingCompleted(true)
    if (isElectron) {
      await window.electronAPI.updateSettings({
        onboardingCompleted: true,
        onboardingVersion: CURRENT_ONBOARDING_VERSION,
      } as Parameters<typeof window.electronAPI.updateSettings>[0])
    }
  }, [])

  if (!loaded || !isAuthorized) return null

  return (
    <OnboardingDialog
      open={showOnboarding}
      onComplete={handleOnboardingComplete}
    />
  )
}
