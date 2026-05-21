import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"

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
          className="no-scrollbar overflow-y-auto px-3 pb-4"
          style={{ maxHeight: "80vh" }}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            {GROUPS.map((group) => (
              <ShortcutGroup key={group.title} group={group} />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
