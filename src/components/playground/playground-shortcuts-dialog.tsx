import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"

interface Row {
  label: string
  keys: Array<string | { text: string; muted?: boolean }>
}

interface Group {
  heading: string
  rows: Row[]
}

const GROUPS: Group[] = [
  {
    heading: "Navigate",
    rows: [
      { label: "Move rows", keys: ["↑", "↓"] },
      { label: "Switch lanes", keys: ["←", "→"] },
    ],
  },
  {
    heading: "Wire",
    rows: [
      { label: "Start / disconnect wire", keys: ["W"] },
      { label: "Confirm wire", keys: ["Enter"] },
      { label: "Cancel wire", keys: ["Esc"] },
      { label: "Direct connect", keys: ["Alt", { text: "click row", muted: true }] },
    ],
  },
  {
    heading: "Draft row",
    rows: [
      { label: "Edit time", keys: ["Enter"] },
      { label: "Remove punch", keys: ["Delete"] },
    ],
  },
  {
    heading: "Gate",
    rows: [
      { label: "Set gate 1 / 2 / 3", keys: ["1", "2", "3"] },
      { label: "Cycle gate", keys: ["Space"] },
      { label: "Clear gate", keys: ["Shift", "Space"] },
    ],
  },
  {
    heading: "Local row",
    rows: [
      { label: "Copy to draft", keys: ["Enter"] },
      { label: "Hide event", keys: ["Delete"] },
    ],
  },
  {
    heading: "General",
    rows: [
      { label: "Add punch", keys: ["A"] },
      { label: "Show shortcuts", keys: ["?"] },
      { label: "Close overlay", keys: ["Esc"] },
    ],
  },
]

function ShortcutRow({ label, keys }: Row) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-foreground/80">{label}</span>
      <KbdGroup className="gap-1">
        {keys.map((k, i) => {
          if (typeof k === "string") {
            return <Kbd key={i}>{k}</Kbd>
          }
          return (
            <span key={i} className="text-[11px] text-muted-foreground/60 italic">
              {k.text}
            </span>
          )
        })}
      </KbdGroup>
    </div>
  )
}

interface PlaygroundShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PlaygroundShortcutsDialog({ open, onOpenChange }: PlaygroundShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-sm gap-0 overflow-hidden p-0"
        onEscapeKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-0">
          <div className="px-6 pt-6 pb-4">
            <DialogTitle className="text-base font-semibold tracking-tight">
              Playground Shortcuts
            </DialogTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Active while Fix miss-punch overlay is open.
            </p>
          </div>

          <Separator />

          <div className="max-h-[60vh] overflow-y-auto px-6 py-4 scrollbar-hide">
            <div className="space-y-4">
              {GROUPS.map((group) => (
                <div key={group.heading}>
                  <p className="mb-0.5 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                    {group.heading}
                  </p>
                  <div className="divide-y divide-border/40">
                    {group.rows.map((row) => (
                      <ShortcutRow key={row.label} {...row} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
