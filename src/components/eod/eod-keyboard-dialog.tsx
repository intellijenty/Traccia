import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Separator } from "../ui/separator"

type KeyPart = string | { text: string }

type ShortcutGroup = {
  title: string
  entries: { action: string; keys: KeyPart[] }[]
}

const GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    entries: [
      { action: "Move between items", keys: ["↑", { text: "/" }, "↓"] },
      { action: "Indent / focus sub-bullet", keys: ["Tab"] },
      { action: "Back to parent task", keys: ["⇧", "Tab"] },
      { action: "Focus first task", keys: ["Enter", { text: "or" }, "Tab"] },
    ],
  },
  {
    title: "Editing",
    entries: [
      { action: "New item below", keys: ["Enter"] },
      { action: "New task after parent", keys: ["Ctrl", "Enter"] },
      { action: "Delete item", keys: ["⌫", { text: "empty" }] },
      { action: "Force delete", keys: ["⇧", "Del"] },
      { action: "Duplicate", keys: ["Alt", "D"] },
    ],
  },
  {
    title: "Reorder",
    entries: [
      { action: "Move item up / down", keys: ["Alt", "↑", { text: "/" }, "↓"] },
      {
        action: "Move block up / down",
        keys: ["Alt", "⇧", "↑", { text: "/" }, "↓"],
      },
    ],
  },
  {
    title: "Page",
    entries: [
      { action: "Open in Outlook", keys: ["Ctrl", "⇧", "O"] },
      { action: "Restore Last Sent", keys: ["Ctrl", "⇧", "R"] },
      { action: "Open Settings", keys: ["Ctrl", "⇧", "S"] },
    ],
  },
]

function KeyDisplay({ keys }: { keys: KeyPart[] }) {
  return (
    <KbdGroup>
      {keys.map((p, i) =>
        typeof p === "string" ? (
          <Kbd key={i}>{p}</Kbd>
        ) : (
          <span key={i} className="px-0.5 text-[10px] text-muted-foreground/40">
            {p.text}
          </span>
        )
      )}
    </KbdGroup>
  )
}

function ShortcutGroup({ group }: { group: ShortcutGroup }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold tracking-widest text-muted-foreground/60 uppercase">
        {group.title}
      </p>
      <div className="space-y-0.5">
        {group.entries.map((entry, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-8 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40"
          >
            <span className="text-sm text-foreground/80">{entry.action}</span>
            <KeyDisplay keys={entry.keys} />
          </div>
        ))}
      </div>
    </div>
  )
}

interface EodKeyboardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EodKeyboardDialog({
  open,
  onOpenChange,
}: EodKeyboardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-full gap-0 overflow-hidden p-0 md:max-w-2xl"
      >
        <div className="px-5 pt-5 pb-4">
          <DialogTitle className="text-sm font-semibold tracking-tight">
            Keyboard Shortcuts
          </DialogTitle>
        </div>

        <div
          className="no-scrollbar flex flex-col gap-y-4 overflow-y-auto px-3 pb-4"
          style={{ maxHeight: "80vh" }}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            {GROUPS.map((group) => (
              <ShortcutGroup key={group.title} group={group} />
            ))}
          </div>

          <Separator />

          <div className="space-y-2 px-2">
            <p className="text-[11px] font-semibold tracking-widest text-muted-foreground/80 uppercase">
              Lazy Inputs - Task description Formatting
            </p>
            <p className="text-justify text-sm leading-tight text-foreground/90">
              Type naturally in any task or bullet field. On blur or Enter, lazy
              inputs automatically parse and format the entry into a clean
              canonical form. Only works if added at the end of the task
              description, in any order, and both are optional. Use{" "}
              <Kbd>Ctrl</Kbd> + <Kbd>Z</Kbd> to undo the formatting if needed.
            </p>

            {/* Before → after example */}
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground/70 uppercase">
                Example
              </p>
              <div className="flex flex-col items-center justify-between gap-0.5 rounded-lg">
                <div className="flex w-full items-center gap-2 text-sm text-muted-foreground/80">
                  <div className="flex-1">
                    <div className="rounded border bg-muted/50 px-2 py-0.5 font-mono text-[12px] leading-relaxed text-foreground/70">
                      <span className="text-foreground/80">TASK-123</span>
                      <span className="text-foreground/40"> - </span>
                      <span className="text-foreground/80">Fix login bug</span>
                      <span className="text-amber-400/90"> 2.5</span>
                      <span className="text-emerald-400/90"> wip</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <span className="text-lg">→</span>
                  </div>
                  <div className="flex-1">
                    <div className="rounded border bg-muted/50 px-2 py-0.5 font-mono text-[12px] leading-relaxed text-foreground/70">
                      <span className="text-foreground/80">TASK-123</span>
                      <span className="text-foreground/40"> - </span>
                      <span className="text-foreground/80">Fix login bug</span>
                      <span className="text-amber-400/90"> (2.5 hr)</span>
                      <span className="text-foreground/40"> →</span>
                      <span className="text-emerald-400/90"> WIP</span>
                    </div>
                  </div>
                </div>
                <div className="flex w-full items-center gap-2 text-sm text-muted-foreground/80">
                  <div className="flex-1">
                    <div className="rounded border bg-muted/50 px-2 py-0.5 font-mono text-[12px] leading-relaxed text-foreground/70">
                      <span className="text-foreground/80">
                        Attended client meeting
                      </span>
                      <span className="text-amber-400/90"> 2h</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <span className="text-lg">→</span>
                  </div>
                  <div className="flex-1">
                    <div className="rounded border bg-muted/50 px-2 py-0.5 font-mono text-[12px] leading-relaxed text-foreground/70">
                      <span className="text-foreground/80">
                        Attended client meeting
                      </span>
                      <span className="text-amber-400/90"> (2 hr)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Token reference */}
            <div className="flex items-center space-x-2">
              <div className="flex items-baseline gap-1">
                <span className="shrink-0 text-sm">Hours keywords -</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Kbd>2h</Kbd>, <Kbd>2.5hr</Kbd>, or just number <Kbd>2</Kbd>
                </span>
              </div>
              <span className="text-center text-lg text-muted-foreground">
                |
              </span>
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 text-xs">Status</span>
                <span className="text-[11px] text-muted-foreground">
                  <Kbd>done</Kbd> or <Kbd>dd</Kbd>, <Kbd>wip</Kbd> or{" "}
                  <Kbd>ww</Kbd>, <Kbd>hold</Kbd>
                </span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
