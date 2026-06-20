import { useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  Download01Icon,
  ArrowDown01Icon,
  FolderOpenIcon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"
import { formatEntriesAsText, formatEntriesAsJSON } from "@/lib/entries-export"
import type { PunchEntry } from "@/lib/types"

interface EntriesExportButtonProps {
  entries: PunchEntry[]
  date: string
}

type ExportFormat = "csv" | "json"

export function EntriesExportButton({ entries, date }: EntriesExportButtonProps) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null)
  const { copy } = useCopyToClipboard()

  async function handleExportFile(format: ExportFormat) {
    if (exporting) return
    setExporting(format)
    try {
      const result = await window.electronAPI.exportFile(format, date)
      if (result.success && result.filePath) {
        const filename = result.filePath.split(/[\\/]/).pop() ?? `traccia-entries-${date}.${format}`
        toast.success(`Saved: ${filename}`, {
          action: {
            label: "Show in Folder",
            onClick: () => window.electronAPI.showItemInFolder(result.filePath!),
          },
          icon: <HugeiconsIcon icon={FolderOpenIcon} size={14} />,
        })
      } else {
        toast.error(`Export failed: ${result.error ?? "unknown error"}`)
      }
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex items-center overflow-hidden rounded-md border border-border/60">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 rounded-none rounded-l-md border-r border-border/60 px-2 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => copy(formatEntriesAsText(entries, date))}
      >
        <HugeiconsIcon icon={Copy01Icon} size={12} className="shrink-0" />
        Copy
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 rounded-none rounded-r-md px-1.5 text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={11} className="shrink-0" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem
            className="gap-2.5 text-xs"
            onClick={() => copy(formatEntriesAsJSON(entries))}
          >
            <HugeiconsIcon icon={Copy01Icon} size={13} className="shrink-0 text-muted-foreground" />
            Copy JSON
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="gap-2.5 text-xs"
            disabled={exporting !== null}
            onClick={() => handleExportFile("csv")}
          >
            <HugeiconsIcon icon={Download01Icon} size={13} className="shrink-0 text-muted-foreground" />
            {exporting === "csv" ? "Exporting…" : "Export CSV"}
          </DropdownMenuItem>

          <DropdownMenuItem
            className="gap-2.5 text-xs"
            disabled={exporting !== null}
            onClick={() => handleExportFile("json")}
          >
            <HugeiconsIcon icon={Download01Icon} size={13} className="shrink-0 text-muted-foreground" />
            {exporting === "json" ? "Exporting…" : "Export JSON"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
