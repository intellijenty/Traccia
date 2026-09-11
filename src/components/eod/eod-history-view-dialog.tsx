import { X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { EodHistoryEntry } from "@/lib/eod-types"

interface EodHistoryViewDialogProps {
  entry: EodHistoryEntry | null
  onClose: () => void
  onRestoreAsDraft: (entry: EodHistoryEntry) => void
}

function formatLongDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

function formatSentAt(isoStr: string): string {
  return new Date(isoStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export function EodHistoryViewDialog({
  entry,
  onClose,
  onRestoreAsDraft,
}: EodHistoryViewDialogProps) {
  return (
    <Dialog
      open={!!entry}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex w-full flex-col gap-0 overflow-hidden p-0 md:max-w-4xl"
        style={{ height: "80vh" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div className="min-w-0 space-y-1 pr-4">
            <DialogTitle className="text-sm font-semibold text-muted-foreground">
              {entry ? formatLongDate(entry.date) : ""}
            </DialogTitle>
            <p className="truncate text-base leading-tight font-medium">
              {entry?.subject}
            </p>
            {entry && (
              <div className="flex items-center gap-2">
                <span
                  className={[
                    "rounded px-1.5 py-0.5 text-[10px] font-medium leading-none",
                    entry.mode === "form"
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "bg-purple-500/10 text-purple-600 dark:text-purple-400",
                  ].join(" ")}
                >
                  {entry.mode === "form" ? "Form" : "Editor"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Sent {formatSentAt(entry.sentAt)}
                </span>
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* HTML preview */}
        <div className="flex-1 overflow-hidden bg-muted/40 p-3">
          <div className="h-full overflow-hidden rounded-md border border-border bg-white shadow-sm">
            {entry && (
              <iframe
                key={entry.date + entry.sentAt}
                srcDoc={entry.htmlBody}
                className="h-full w-full border-0"
                sandbox="allow-same-origin"
                title="EOD email preview"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {entry && (
            <Button
              type="button"
              size="sm"
              onClick={() => onRestoreAsDraft(entry)}
            >
              Restore as Draft
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
