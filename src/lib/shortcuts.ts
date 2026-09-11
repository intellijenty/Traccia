/**
 * App Shortcuts Registry
 *
 * Central definition of every in-app keyboard shortcut.
 * These only fire when the app window is focused and the focused element is
 * not a text input — they never intercept keystrokes from other applications.
 *
 * Adding a shortcut:
 *   1. Extend the ShortcutId union with a new literal.
 *   2. Add an entry to SHORTCUTS.
 *   3. Register a handler in App.tsx via useAppShortcuts().
 *
 * Configurable shortcuts (configurable: true) are ones the user will be able
 * to remap from the Settings → Accessibility tab in the future. Built-in
 * shortcuts (configurable: false) are fixed and not shown in settings.
 */

export type ShortcutId =
  | "toggle-window-size"
  | "open-settings"
  | "open-shortcuts"
  | "day-prev"
  | "day-next"
  | "go-today"
  | "week-prev"
  | "week-next"
  | "close-window"
  | "nav-home"
  | "nav-eod"

export interface AppShortcut {
  id: ShortcutId
  /** The key value as returned by KeyboardEvent.key (case-insensitive for single chars). */
  defaultKey: string
  modifiers?: {
    ctrl?: boolean
    alt?: boolean
    shift?: boolean
    meta?: boolean
  }
  label: string
  description: string
  /** When true the user can remap this key from Settings. When false it is fixed. */
  configurable: boolean
}

export const SHORTCUTS: readonly AppShortcut[] = [
  {
    id: "toggle-window-size",
    defaultKey: "f",
    label: "Toggle Window Size",
    description: "Switch between compact narrow view and full window",
    configurable: false,
  },
  {
    id: "open-settings",
    defaultKey: "s",
    label: "Open Settings",
    description: "Open the settings dialog",
    configurable: false,
  },
  {
    id: "day-prev",
    defaultKey: "ArrowLeft",
    label: "Previous Day",
    description: "Navigate to the previous day",
    configurable: false,
  },
  {
    id: "day-next",
    defaultKey: "ArrowRight",
    label: "Next Day",
    description: "Navigate to the next day",
    configurable: false,
  },
  {
    id: "go-today",
    defaultKey: "t",
    label: "Go to Today",
    description: "Jump to today regardless of current day view",
    configurable: false,
  },
  {
    id: "week-prev",
    defaultKey: "ArrowUp",
    label: "Previous Week",
    description:
      "Navigate to the same day in the previous week (wide view only)",
    configurable: false,
  },
  {
    id: "week-next",
    defaultKey: "ArrowDown",
    label: "Next Week",
    description: "Navigate to the same day in the next week (wide view only)",
    configurable: false,
  },
  {
    id: "close-window",
    defaultKey: "Escape",
    label: "Close Window",
    description: "Hide the app window (or close the topmost dialog first)",
    configurable: false,
  },
  {
    id: "open-shortcuts",
    defaultKey: "?",
    modifiers: { shift: true },
    label: "Keyboard Shortcuts",
    description: "Show keyboard shortcuts reference",
    configurable: false,
  },
  {
    id: "nav-home",
    defaultKey: "h",
    label: "Go to Home",
    description: "Switch to the Home tab",
    configurable: false,
  },
  {
    id: "nav-eod",
    defaultKey: "e",
    label: "Go to EOD",
    description: "Switch to the EOD Draft tab",
    configurable: false,
  },
] as const

/** Convenience map for O(1) lookup by id. */
export const SHORTCUT_MAP = new Map<ShortcutId, AppShortcut>(
  SHORTCUTS.map((s) => [s.id, s])
)

/** Handler map type — pass this into useAppShortcuts(). */
export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>
