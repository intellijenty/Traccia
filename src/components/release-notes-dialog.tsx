import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
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
        <div className="scrollbar-hide overflow-y-auto px-6 py-5" style={{ maxHeight: 600 }}>
          {notes ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{
                // Strip the top-level "## vX.Y.Z — Date" heading — already in dialog header
                h2: () => null,
                h3: ({ children }) => (
                  <h3 className="mb-4 mt-4 font-semibold tracking-tight text-foreground first:mt-0">
                    {children}
                  </h3>
                ),
                ul: ({ children }) => (
                  <ul className="space-y-2">{children}</ul>
                ),
                li: ({ children }) => (
                  <li className="flex items-start gap-2 text-sm text-foreground">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/50" />
                    <span>{children}</span>
                  </li>
                ),
                p: ({ children }) => (
                  <p className="text-sm text-foreground">{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="font-extrabold text-foreground">{children}</strong>
                ),
                code: ({ children }) => (
                  <code className="rounded bg-muted-foreground/50 px-1.5 py-0.5 font-mono text-xs">
                    {children}
                  </code>
                ),
              }}
            >
              {notes}
            </ReactMarkdown>
          ) : (
            <p className="text-sm text-foreground">
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
