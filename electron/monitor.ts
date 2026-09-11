import { powerMonitor } from "electron"
import { insertEntry, getLastEntry } from "./database"
import { writeHeartbeat } from "./heartbeat"

type EventCallback = () => void

let onChangeCallback: EventCallback | null = null
let resumeFallbackTimer: ReturnType<typeof setTimeout> | null = null

// After wake-from-sleep, wait this long for an unlock-screen event.
// If none arrives, assume no lock screen is configured and log LOGIN directly.
const RESUME_FALLBACK_MS = 10000

function logEvent(type: "LOGIN" | "LOGOUT", trigger: string): void {
  const last = getLastEntry()
  if (last?.type === type) return // already in this state — skip
  insertEntry(type, "auto", trigger)
  writeHeartbeat()
  onChangeCallback?.()
}

function cancelFallback(): void {
  if (resumeFallbackTimer) {
    clearTimeout(resumeFallbackTimer)
    resumeFallbackTimer = null
  }
}

export function startMonitoring(onChange: EventCallback): void {
  onChangeCallback = onChange

  powerMonitor.on("lock-screen", () => {
    cancelFallback()
    logEvent("LOGOUT", "via lock")
  })

  powerMonitor.on("unlock-screen", () => {
    cancelFallback()
    logEvent("LOGIN", "via unlock")
  })

  powerMonitor.on("suspend", () => {
    cancelFallback()
    logEvent("LOGOUT", "via sleep")
  })

  powerMonitor.on("resume", () => {
    cancelFallback()
    const last = getLastEntry()
    if (last?.type === "LOGOUT") {
      // Wait for unlock-screen. If none fires, no lock screen is configured.
      resumeFallbackTimer = setTimeout(() => {
        resumeFallbackTimer = null
        logEvent("LOGIN", "via resume")
      }, RESUME_FALLBACK_MS)
    } else {
      logEvent("LOGIN", "via resume")
    }
  })

  powerMonitor.on("shutdown", () => {
    cancelFallback()
    logEvent("LOGOUT", "via shutdown")
  })
}
