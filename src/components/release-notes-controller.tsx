import { useState, useEffect } from "react"
import { toast } from "sonner"
import { ReleaseNotesDialog } from "./release-notes-dialog"
import { extractVersionNotes } from "@/lib/release-notes"

declare const __APP_VERSION__: string

const isElectron = typeof window !== "undefined" && !!window.electronAPI
const TOAST_ID = "release-notes-toast"
const SESSION_KEY = "rn-checked"

export function ReleaseNotesController() {
  const [dialogOpen, setDialogOpen] = useState(false)

  function showToast(version: string) {
    const hasNotes = !!extractVersionNotes(version)

    const dismiss = () => {
      if (isElectron)
        window.electronAPI.updateSettings({ releaseNotesPending: false })
      toast.dismiss(TOAST_ID)
    }

    toast.success(`Updated to v${version}`, {
      id: TOAST_ID,
      duration: Infinity,
      description: hasNotes
        ? "See what changed in this release"
        : "App has been updated successfully",
      cancel: { label: "Dismiss", onClick: dismiss },
      ...(hasNotes && {
        action: {
          label: "What's new",
          onClick: () => {
            dismiss()
            setDialogOpen(true)
          },
        },
      }),
    })
  }

  useEffect(() => {
    // sessionStorage survives React StrictMode + HMR re-evaluation; clears on app restart
    if (sessionStorage.getItem(SESSION_KEY)) return
    sessionStorage.setItem(SESSION_KEY, "1")

    async function check() {
      if (!isElectron) {
        setTimeout(() => showToast(__APP_VERSION__), 700)
        return
      }

      const settings = await window.electronAPI.getSettings()
      const { lastSeenVersion, releaseNotesPending, onboardingCompleted } =
        settings
      const current = __APP_VERSION__

      if (lastSeenVersion !== current) {
        const updates: Record<string, unknown> = { lastSeenVersion: current }
        if (onboardingCompleted) updates.releaseNotesPending = true
        await window.electronAPI.updateSettings(updates)
      }

      const shouldShow =
        releaseNotesPending ||
        (lastSeenVersion !== current && onboardingCompleted)

      if (shouldShow) setTimeout(() => showToast(current), 700)
    }

    check()
  }, [])

  return (
    <ReleaseNotesDialog
      version={__APP_VERSION__}
      open={dialogOpen}
      onClose={() => setDialogOpen(false)}
    />
  )
}
