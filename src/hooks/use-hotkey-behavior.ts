import { useEffect } from "react"

const isElectron = typeof window !== "undefined" && !!window.electronAPI

/**
 * Listens for push-to-display hotkey events from main process.
 * When triggered, registers a keyup listener and hides the window
 * when the trigger key is released.
 */
export function useHotkeyBehavior() {
  useEffect(() => {
    if (!isElectron) return

    const unsubscribe = window.electronAPI.onHotkeyPushShow(
      (triggerKey: string) => {
        // triggerKey is e.g. "Space", "P", "F1"
        const handleKeyUp = (e: KeyboardEvent) => {
          const released =
            e.key === " "
              ? "Space"
              : e.key.length === 1
                ? e.key.toUpperCase()
                : e.key
          if (released === triggerKey || e.key === triggerKey) {
            window.electronAPI.windowHide()
            document.removeEventListener("keyup", handleKeyUp)
          }
        }
        // Small delay so the window is fully focused before we listen
        setTimeout(() => {
          document.addEventListener("keyup", handleKeyUp)
        }, 50)
      }
    )

    return unsubscribe
  }, [])
}
