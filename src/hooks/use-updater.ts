import { useEffect } from "react"
import { toast } from "sonner"

// Baked at build time from package.json via vite.config.ts define — no async IPC, no race condition
declare const __APP_VERSION__: string

const isElectron = typeof window !== "undefined" && !!window.electronAPI

const PROMPT_TOAST_ID = "update-prompt"
const PROGRESS_TOAST_ID = "update-progress"
const READY_TOAST_ID = "update-ready"
const CHECK_TOAST_ID = "update-check"

export function useUpdater() {
  useEffect(() => {
    if (!isElectron) return

    const api = window.electronAPI

    const unsubs = [
      api.onUpdateAvailable((info) => {
        // Dismiss checking toast if a manual check triggered this
        toast.dismiss(CHECK_TOAST_ID)

        toast(`${__APP_VERSION__} → ${info.version}`, {
          id: PROMPT_TOAST_ID,
          duration: Infinity,
          description:
            "A new version of Traccia is available. Download and install now?",
          cancel: {
            label: "Later",
            onClick: () => toast.dismiss(PROMPT_TOAST_ID),
          },
          action: {
            label: "Install now",
            onClick: () => {
              toast.dismiss(PROMPT_TOAST_ID)
              toast.loading("Starting download…", {
                id: PROGRESS_TOAST_ID,
                duration: Infinity,
              })
              api.downloadUpdate()
            },
          },
        })
      }),

      api.onUpdateProgress((p) => {
        toast.loading(`Downloading… ${p.percent}%`, {
          id: PROGRESS_TOAST_ID,
          duration: Infinity,
        })
      }),

      api.onUpdateDownloaded((info) => {
        toast.dismiss(PROGRESS_TOAST_ID)
        toast.success(`v${info.version} ready to install`, {
          id: READY_TOAST_ID,
          duration: Infinity,
          description: "Restart Traccia to apply the update.",
          action: {
            label: "Restart now",
            onClick: () => api.installUpdate(),
          },
        })
      }),

      // Silent on background errors — only manual-check errors surface (handled in checkNow)
      api.onUpdateError(() => {
        toast.dismiss(PROGRESS_TOAST_ID)
      }),
    ]

    return () => unsubs.forEach((u) => u())
  }, [])

  function checkNow() {
    if (!isElectron) return

    // Clear any stale update UI before re-checking
    toast.dismiss(PROMPT_TOAST_ID)
    toast.dismiss(READY_TOAST_ID)
    toast.loading("Checking for updates…", {
      id: CHECK_TOAST_ID,
      duration: Infinity,
    })

    window.electronAPI.checkForUpdates()

    // Temp listeners scoped to this manual check — all cleaned up once we get a response.
    // Array pattern avoids let + circular-reference between cleanup and the unsub consts.
    const unsubs: Array<() => void> = []
    const cleanup = () => {
      unsubs.forEach((u) => u())
      unsubs.length = 0
    }

    unsubs.push(
      window.electronAPI.onUpdateNotAvailable(() => {
        toast.dismiss(CHECK_TOAST_ID)
        toast.success("Already on latest version", { duration: 3000 })
        cleanup()
      }),
      window.electronAPI.onUpdateError((msg) => {
        toast.dismiss(CHECK_TOAST_ID)
        toast.error(`Update check failed: ${msg}`, { duration: 5000 })
        cleanup()
      })
    )

    // Auto-cleanup after 30s — guards against network timeout with no event response
    const timer = setTimeout(() => {
      toast.dismiss(CHECK_TOAST_ID)
      cleanup()
    }, 30_000)

    unsubs.push(() => clearTimeout(timer))
  }

  return { checkNow }
}
