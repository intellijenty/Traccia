import { globalShortcut, BrowserWindow } from "electron"

// Modifier key names in Electron accelerator format
const MODIFIER_KEYS = new Set([
  "Ctrl",
  "Control",
  "Alt",
  "Option",
  "Shift",
  "Super",
  "Meta",
  "Command",
  "Cmd",
  "CommandOrControl",
  "CmdOrCtrl",
])

let registeredCombo: string | null = null

/**
 * Extract the non-modifier trigger key from a combo.
 * e.g. "Alt+Space" → "Space", "Ctrl+Shift+P" → "P"
 */
export function getTriggerKey(combo: string): string {
  const parts = combo.split("+")
  const nonMods = parts.filter((p) => !MODIFIER_KEYS.has(p))
  return nonMods[nonMods.length - 1] ?? parts[parts.length - 1]
}

/**
 * Register a global hotkey. Returns { success, error? }.
 * Call this any time settings change — it automatically unregisters the old one.
 */
export function registerHotkey(
  getWindow: () => BrowserWindow | null,
  combo: string,
  mode: "press" | "push",
  enabled: boolean
): { success: boolean; error?: string } {
  // Always clean up previous registration
  if (registeredCombo) {
    try {
      globalShortcut.unregister(registeredCombo)
    } catch {}
    registeredCombo = null
  }

  if (!enabled || !combo.trim()) return { success: true }

  try {
    const ok = globalShortcut.register(combo, () => {
      const win = getWindow()
      if (!win || win.isDestroyed()) return

      if (mode === "press") {
        // Toggle: show if hidden/unfocused, hide if visible & focused
        if (win.isVisible() && win.isFocused()) {
          win.hide()
        } else {
          win.show()
          win.focus()
        }
      } else {
        // Push: show window, tell renderer to watch for key release
        if (!win.isVisible()) win.show()
        win.focus()
        win.webContents.send("hotkey:push-show", getTriggerKey(combo))
      }
    })

    if (ok) {
      registeredCombo = combo
      return { success: true }
    }
    return {
      success: false,
      error: "Shortcut is already registered by another application",
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export function unregisterHotkey(): void {
  if (registeredCombo) {
    try {
      globalShortcut.unregister(registeredCombo)
    } catch {}
    registeredCombo = null
  }
}
