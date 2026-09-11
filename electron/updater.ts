import { autoUpdater } from "electron-updater"
import { BrowserWindow } from "electron"

type UpdateEventSender = (channel: string, ...args: unknown[]) => void

let send: UpdateEventSender = () => {}

function push(channel: string, ...args: unknown[]) {
  send(channel, ...args)
}

export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  send = (channel, ...args) => {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }

  autoUpdater.on("checking-for-update", () => {
    push("update:checking")
  })

  autoUpdater.on("update-available", (info) => {
    push("update:available", {
      version: info.version,
      releaseNotes: info.releaseNotes,
    })
  })

  autoUpdater.on("update-not-available", () => {
    push("update:not-available")
  })

  autoUpdater.on("download-progress", (progress) => {
    push("update:progress", {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on("update-downloaded", (info) => {
    push("update:downloaded", { version: info.version })
  })

  autoUpdater.on("error", (err) => {
    push("update:error", err.message)
  })
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch((err: Error) => {
    console.error("[updater] checkForUpdates failed:", err.message)
  })
}

export function downloadUpdate(): void {
  autoUpdater.downloadUpdate().catch((err: Error) => {
    console.error("[updater] downloadUpdate failed:", err.message)
  })
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall(false, true)
}
