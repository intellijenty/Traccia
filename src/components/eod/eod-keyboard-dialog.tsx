import type { ReactNode } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Separator } from "../ui/separator"
import { TiGlyph } from "@/components/ui/ti-glyph"

type KeyPart = string | { text: string }

type Entry = { action: string; keys: KeyPart[] }
type ShortcutGroup = { title: string; entries: Entry[] }

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
      { action: "Force delete", keys: ["⇧", "Del"] },
      { action: "Duplicate", keys: ["Alt", "D"] },
    ],
  },
  {
    title: "Reorder",
    entries: [
      { action: "Move item up / down", keys: ["Alt", "↑", { text: "/" }, "↓"] },
      { action: "Move block up / down", keys: ["Alt", "⇧", "↑", { text: "/" }, "↓"] },
    ],
  },
  {
    title: "Page",
    entries: [
      { action: "Open Traccia Intelligence", keys: ["G"] },
      { action: "Open in Outlook", keys: ["Ctrl", "⇧", "O"] },
      { action: "Restore Last Sent", keys: ["Ctrl", "⇧", "R"] },
      { action: "Open Settings", keys: ["Ctrl", "⇧", "S"] },
    ],
  },
]

// Shortcuts available inside the Traccia Intelligence panel.
const AI_ENTRIES: Entry[] = [
  { action: "Generate", keys: ["Enter"] },
  { action: "Regenerate", keys: ["R"] },
  { action: "Add selected", keys: ["Ctrl", "Enter"] },
  { action: "Replace & add", keys: ["Ctrl", "⇧", "Enter"] },
  { action: "Select / deselect all", keys: ["Ctrl", "A"] },
  { action: "Range-select items", keys: ["⇧", { text: "Click" }] },
  { action: "Show Evidence / EOD", keys: ["E"] },
  { action: "Focus refine input", keys: ["/"] },
  { action: "Close panel", keys: ["Esc"] },
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

function EntryRow({ entry }: { entry: Entry }) {
  return (
    <div className="flex items-center justify-between gap-8 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40">
      <span className="text-sm text-foreground/80">{entry.action}</span>
      <KeyDisplay keys={entry.keys} />
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground/60 uppercase">
      {children}
    </p>
  )
}

function ShortcutGroup({ group }: { group: ShortcutGroup }) {
  return (
    <div>
      <SectionTitle>{group.title}</SectionTitle>
      <div className="space-y-0.5">
        {group.entries.map((entry, i) => (
          <EntryRow key={i} entry={entry} />
        ))}
      </div>
    </div>
  )
}

interface EodKeyboardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EodKeyboardDialog({ open, onOpenChange }: EodKeyboardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-full gap-0 overflow-hidden p-0 md:max-w-3xl"
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
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {GROUPS.map((group) => (
              <ShortcutGroup key={group.title} group={group} />
            ))}
          </div>

          <Separator />

          {/* Traccia Intelligence */}
          <div>
            <SectionTitle>
              <TiGlyph size={12} /> Traccia Intelligence
            </SectionTitle>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
              {AI_ENTRIES.map((entry, i) => (
                <EntryRow key={i} entry={entry} />
              ))}
            </div>
          </div>

          <Separator />

          {/* Lazy Inputs — compact */}
          <div className="space-y-2 px-2">
            <SectionTitle>Lazy Inputs — auto-formatting</SectionTitle>
            <p className="text-xs leading-snug text-muted-foreground">
              Type naturally; on <Kbd>Enter</Kbd> or blur the entry auto-formats.
              Append tokens at the end in any order — both optional.{" "}
              <Kbd>Ctrl</Kbd> <Kbd>Z</Kbd> undoes.
            </p>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-muted/40 px-2 py-1.5 font-mono text-[11px]">
              <span className="text-foreground/70">TASK-123 - Fix login bug</span>
              <span className="text-amber-400/90">2.5</span>
              <span className="text-emerald-400/90">wip</span>
              <span className="px-1 text-muted-foreground/50">→</span>
              <span className="text-foreground/70">TASK-123 - Fix login bug</span>
              <span className="text-amber-400/90">(2.5 hr)</span>
              <span className="text-muted-foreground/40">→</span>
              <span className="text-emerald-400/90">WIP</span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                Hours <Kbd>2h</Kbd> <Kbd>2.5hr</Kbd> <Kbd>2</Kbd>
              </span>
              <span className="flex items-center gap-1">
                Status <Kbd>done</Kbd>/<Kbd>dd</Kbd> <Kbd>wip</Kbd>/<Kbd>ww</Kbd>{" "}
                <Kbd>hold</Kbd>
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
