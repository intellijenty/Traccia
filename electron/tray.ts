import { Tray, Menu, nativeImage, BrowserWindow } from "electron"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let tray: Tray | null = null

function getIconPath(status: "in" | "out"): string {
  const iconName = status === "in" ? "icon-green.png" : "icon-red.png"
  // In dev: resources/ is at project root; in prod: it's in app.getAppPath()
  if (process.env.VITE_DEV_SERVER_URL) {
    return path.join(__dirname, "..", "resources", iconName)
  }
  return path.join(process.resourcesPath, iconName)
}

function createTrayIcon(status: "in" | "out"): Electron.NativeImage {
  return nativeImage.createFromPath(getIconPath(status))
}

function buildContextMenu(
  mainWindow: BrowserWindow | null,
  onQuit: () => void
): Menu {
  return Menu.buildFromTemplate([
    {
      label: "Show Dashboard",
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: onQuit,
    },
  ])
}

export function createTray(
  mainWindow: BrowserWindow | null,
  onQuit: () => void
): Tray {
  const icon = createTrayIcon("out")
  tray = new Tray(icon)

  tray.setToolTip("Traccia")
  tray.setContextMenu(buildContextMenu(mainWindow, onQuit))

  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })

  return tray
}

export function updateTrayStatus(status: "in" | "out"): void {
  if (!tray) return
  tray.setImage(createTrayIcon(status))
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
