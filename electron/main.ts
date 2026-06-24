import { app, BrowserWindow, Menu } from "electron"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Core modules
import {
  initDatabase,
  insertEntry,
  getLastEntry,
  closeDatabase,
  calculateTotalSecondsForDate,
  getAllSettings,
} from "./database"

import {
  readHeartbeat,
  startHeartbeat,
  stopHeartbeat,
  clearHeartbeat,
} from "./heartbeat"
import { startMonitoring } from "./monitor"
import { createTray, updateTrayStatus, destroyTray } from "./tray"
import { registerIpcHandlers } from "./ipc"
import { claude } from "./claude-service"
import { registerHotkey, unregisterHotkey } from "./hotkey"
import { scheduleDailySync } from "./daily-sync"
import { initAutoUpdater, checkForUpdates } from "./updater"
import { initAlphaService } from "./alpha-service"

let mainWindow: BrowserWindow | null = null
let isQuitting = false

// Environment & Configuration
const isDev = !app.isPackaged
const APP_NAME = app.getName()

// Separate userData folder in development (keeps DB and settings independent)
if (isDev) {
  const devUserData = path.join(app.getPath("appData"), `${APP_NAME}-Dev`)
  app.setPath("userData", devUserData)
  console.log(`Development mode: Using separate userData - ${devUserData}`)
}

// ─────────────────────────────────────────────────────────────
// Single Instance Lock (only for packaged/production builds)
// Allows Dev + Installed to run side-by-side
// ─────────────────────────────────────────────────────────────
const gotTheLock = isDev ? true : app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.log("Another instance is already running. Quitting...")
  app.quit()
  process.exit(0)
}

// Handle second instance attempts (only relevant for packaged app)
if (!isDev) {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// ─────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────
// Flag passed to the OS Run-key launch so we can detect login-launch on Windows.
// (wasOpenedAtLogin is macOS-only; on Windows we must sniff process.argv.)
const LOGIN_LAUNCH_FLAG = "--hidden"

function wasOpenedAtLogin(): boolean {
  return app.isPackaged && process.argv.includes(LOGIN_LAUNCH_FLAG)
}

function syncLoginItem(enabled: boolean): void {
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      args: [LOGIN_LAUNCH_FLAG],
    })
  }
}

function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return `${hours}h ${String(minutes).padStart(2, "0")}m`
}

function getLocalDate(): string {
  return new Date().toLocaleDateString("en-CA")
}

function notifyRenderer(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("event-update")
  }
  refreshTray()
}

function refreshTray(): void {
  const lastEntry = getLastEntry()
  const status = lastEntry?.type === "LOGIN" ? "in" : "out"
  const totalSeconds = calculateTotalSecondsForDate(getLocalDate())
  const timeStr = formatTime(totalSeconds)

  updateTrayStatus(
    status,
    timeStr,
    mainWindow,
    handlePunchIn,
    handlePunchOut,
    handleQuit
  )
}

function handlePunchIn(): void {
  insertEntry("LOGIN", "manual", "via manual")
  notifyRenderer()
}

function handlePunchOut(): void {
  insertEntry("LOGOUT", "manual", "via manual")
  notifyRenderer()
}

function handleQuit(): void {
  destroyTray()
  app.quit() // cleanup runs in before-quit
}

function handleStartupRecovery(): void {
  const lastEntry = getLastEntry()
  if (!lastEntry || lastEntry.type !== "LOGIN") return

  const heartbeat = readHeartbeat()
  let estimatedTime = lastEntry.timestamp

  if (heartbeat) {
    const heartbeatTime = new Date(heartbeat.timestamp).getTime()
    const loginTime = new Date(lastEntry.timestamp).getTime()
    // Trust heartbeat as long as it postdates the last LOGIN — no age limit, since
    // end-of-day shutdown means the heartbeat may be many hours old by next morning.
    if (heartbeatTime >= loginTime) {
      estimatedTime = heartbeat.timestamp
    }
  }

  const loginDate = new Date(lastEntry.timestamp).toLocaleDateString("en-CA")
  const estimatedDate = new Date(estimatedTime).toLocaleDateString("en-CA")

  if (estimatedDate !== loginDate) {
    // Session crossed midnight — close previous day at 23:59:59, open new day at 00:00:00, then close at estimated time
    const eodTs = new Date(`${loginDate}T23:59:59.999`).toISOString()
    const sodTs = new Date(`${estimatedDate}T00:00:00.000`).toISOString()
    insertEntry("LOGOUT", "estimated", "via estimated", eodTs, "Auto-closed at midnight — session continued past midnight")
    insertEntry("LOGIN", "estimated", "via estimated", sodTs, "Auto-opened at midnight — session continued from previous day")
    insertEntry("LOGOUT", "estimated", "via estimated", estimatedTime, "Session ended unexpectedly. Logout time estimated from last heartbeat.")
  } else {
    insertEntry("LOGOUT", "estimated", "via estimated", estimatedTime, "Session ended unexpectedly. Logout time estimated from last heartbeat.")
  }
}

let midnightTimer: ReturnType<typeof setTimeout> | null = null

function scheduleMidnightSplit(): void {
  if (midnightTimer) clearTimeout(midnightTimer)
  const now = new Date()
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  midnightTimer = setTimeout(() => {
    handleMidnightSplit()
    scheduleMidnightSplit()
  }, tomorrow.getTime() - now.getTime())
}

function handleMidnightSplit(): void {
  const lastEntry = getLastEntry()
  if (!lastEntry || lastEntry.type !== "LOGIN") return

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const prevDate = yesterday.toLocaleDateString("en-CA")
  const today = getLocalDate()

  const eodTs = new Date(`${prevDate}T23:59:59.999`).toISOString()
  const sodTs = new Date(`${today}T00:00:00.000`).toISOString()

  insertEntry("LOGOUT", "auto", "via midnight", eodTs, "Auto-closed at midnight")
  insertEntry("LOGIN", "auto", "via midnight", sodTs, "Auto-opened at midnight")
  notifyRenderer()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 780,
    minWidth: 400,
    minHeight: 600,
    resizable: true,
    titleBarStyle: "hidden",
    show: false,
    backgroundColor: "#0a0a0a",
    icon: path.join(__dirname, "../resources/desktopIcon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Load either dev server or built index
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist-react/index.html"))
  }

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  // F12 DevTools shortcut
  mainWindow.webContents.on("before-input-event", (_, input) => {
    if (input.key === "F12" && input.type === "keyDown") {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  mainWindow.on("ready-to-show", () => {
    // Stay hidden in tray when launched at login; show on manual launch.
    if (!wasOpenedAtLogin()) {
      mainWindow?.show()
    }
  })

  mainWindow.on("maximize", () => mainWindow?.webContents.send("window:maximized", true))
  mainWindow.on("unmaximize", () => mainWindow?.webContents.send("window:maximized", false))
  mainWindow.on("focus", () => mainWindow?.webContents.send("window:focus", true))
  mainWindow.on("blur", () => mainWindow?.webContents.send("window:focus", false))
}

// ─────────────────────────────────────────────────────────────
// App Lifecycle
// ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  Menu.setApplicationMenu(null) // Remove default menu bar

  // Core initialization
  initDatabase()
  handleStartupRecovery()

  // Auto-start (login item) setting
  const startupSettings = getAllSettings()
  syncLoginItem(startupSettings.autoStart !== "false")

  // Boot login entry — only if last known state is LOGOUT (or no history)
  const lastAfterRecovery = getLastEntry()
  if (!lastAfterRecovery || lastAfterRecovery.type === "LOGOUT") {
    insertEntry("LOGIN", "auto", "via boot")
  }

  // Alpha user flag (fire-and-forget — resolves before renderer mounts)
  initAlphaService()

  // Start services
  startHeartbeat(60)
  startMonitoring(notifyRenderer)

  // Register IPC handlers
  registerIpcHandlers(notifyRenderer, () => mainWindow)

  // Create main window
  createWindow()

  // Register global hotkey from settings
  const settings = getAllSettings()
  registerHotkey(
    () => mainWindow,
    settings.hotkeyCombo || "Alt+Space",
    (settings.hotkeyMode || "press") as "press" | "push",
    settings.hotkeyEnabled !== "false"
  )

  // Tray
  createTray(mainWindow, handlePunchIn, handlePunchOut, handleQuit)
  refreshTray()

  // Midnight auto-split (closes open session at day boundary)
  scheduleMidnightSplit()

  // Daily background sync
  scheduleDailySync(notifyRenderer)

  // Auto-updater (only in packaged builds)
  if (app.isPackaged) {
    initAutoUpdater(() => mainWindow)
    setTimeout(() => checkForUpdates(), 5000)
  }
})

app.on("window-all-closed", () => {
  // App stays alive in tray — do not quit
})

let cleanupDone = false

app.on("before-quit", () => {
  if (cleanupDone) return
  cleanupDone = true

  // Distinguish system shutdown (before-quit fires without handleQuit) from user quit
  const trigger = isQuitting ? "via quit" : "via shutdown"
  isQuitting = true
  unregisterHotkey()

  if (midnightTimer) { clearTimeout(midnightTimer); midnightTimer = null }

  const lastEntry = getLastEntry()
  if (lastEntry?.type === "LOGIN") {
    insertEntry("LOGOUT", "auto", trigger)
  }

  claude.cleanup()
  stopHeartbeat()
  clearHeartbeat()
  closeDatabase()
  destroyTray()
})

app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show()
  }
})
