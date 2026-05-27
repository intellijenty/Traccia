import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { extractVersionNotes } from "@/lib/release-notes"

interface ReleaseNotesDialogProps {
  version: string
  open: boolean
  onClose: () => void
}

export function ReleaseNotesDialog({ version, open, onClose }: ReleaseNotesDialogProps) {
  const notes = extractVersionNotes(version)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-4xl gap-0 p-0 overflow-hidden"
        overlayBlur="supports-backdrop-filter:backdrop-blur-2xl"
      >
        {/* Header */}
        <DialogHeader className="border-b border-border/30 px-6 py-4">
          <DialogTitle className="text-sm font-semibold">
            What&apos;s new in v{version}
          </DialogTitle>
        </DialogHeader>

        {/* Markdown content */}
        <div className="scrollbar-hide overflow-y-auto px-6 py-5" style={{ maxHeight: 500 }}>
          {notes ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Strip the top-level "## vX.Y.Z — Date" heading — already in dialog header
                h2: () => null,
                h3: ({ children }) => (
                  <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-foreground/80 first:mt-0">
                    {children}
                  </h3>
                ),
                ul: ({ children }) => (
                  <ul className="space-y-2">{children}</ul>
                ),
                li: ({ children }) => (
                  <li className="flex items-start gap-2 text-sm text-foreground">
                    <span className="mt-1.25 h-1 w-1 shrink-0 rounded-full bg-foreground/25" />
                    <span>{children}</span>
                  </li>
                ),
                p: ({ children }) => (
                  <p className="text-sm text-muted-foreground">{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="font-medium text-foreground">{children}</strong>
                ),
                code: ({ children }) => (
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                    {children}
                  </code>
                ),
              }}
            >
              {notes}
            </ReactMarkdown>
          ) : (
            <p className="text-sm text-muted-foreground">
              No release notes available for this version.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border/30 px-6 py-3">
          <Button size="sm" className="h-8 px-4 text-xs" onClick={onClose}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
