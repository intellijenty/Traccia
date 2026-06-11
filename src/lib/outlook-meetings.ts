import { execFile } from "child_process"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

export interface OutlookMeeting {
  title: string
  /** Duration in minutes */
  duration: number
  /** ISO 8601 start datetime (with offset) */
  start: string
  /** Outlook ResponseStatus: 0=None, 1=Organized, 2=Tentative, 3=Accepted, 4=Declined, 5=NotResponded */
  responseStatus: number
  isRecurring: boolean
  isAllDay: boolean
  location: string
}

export interface OutlookMeetingsOptions {
  /** How many days ahead to fetch (default: 1) */
  days?: number
  /** Start date — defaults to today (local midnight) */
  from?: Date
}

function buildScript(fromIso: string, toIso: string): string {
  // Format dates inside PS using *current culture* so Outlook's Restrict
  // parser (same culture) round-trips correctly. Parse the inbound ISO with
  // InvariantCulture + RoundtripKind so PS doesn't misread it locally.
  return `$ErrorActionPreference = "Stop"
try {
  $iv = [System.Globalization.CultureInfo]::InvariantCulture
  $rk = [System.Globalization.DateTimeStyles]::RoundtripKind
  $from = [DateTime]::Parse('${fromIso}', $iv, $rk)
  $to   = [DateTime]::Parse('${toIso}', $iv, $rk)
  $fromStr = $from.ToString("g")
  $toStr   = $to.ToString("g")

  $outlook = New-Object -ComObject Outlook.Application
  $ns = $outlook.GetNamespace("MAPI")
  $cal = $ns.GetDefaultFolder(9)

  $items = $cal.Items
  $items.Sort("[Start]")
  $items.IncludeRecurrences = $true

  $filter = "[Start] >= '$fromStr' AND [Start] < '$toStr'"
  $restricted = $items.Restrict($filter)

  $results = [System.Collections.Generic.List[object]]::new()
  foreach ($i in $restricted) {
    $results.Add([PSCustomObject]@{
      title          = [string]$i.Subject
      duration       = [int]$i.Duration
      start          = $i.Start.ToString("o", $iv)
      responseStatus = [int]$i.ResponseStatus
      isRecurring    = [bool]$i.IsRecurring
      isAllDay       = [bool]$i.AllDayEvent
      location       = [string]$i.Location
    })
  }

  $arr = @($results.ToArray())
  if ($arr.Count -eq 0) {
    Write-Output '[]'
  } elseif ($arr.Count -eq 1) {
    Write-Output ('[' + ($arr[0] | ConvertTo-Json -Compress -Depth 3) + ']')
  } else {
    $arr | ConvertTo-Json -Compress -Depth 3 | Write-Output
  }
} catch {
  [Console]::Error.WriteLine("OUTLOOK_SYNC_ERROR " + $_.Exception.Message)
  exit 1
}
`
}

/**
 * Fetches meetings from Outlook calendar via COM automation.
 * Requires classic Outlook installed and a MAPI profile configured.
 * Only works on Windows.
 *
 * Defense-in-depth: results are post-filtered in JS on the actual `start`
 * timestamp so any Outlook Restrict locale/recurrence edge cases cannot
 * leak out-of-window items.
 */
export async function getOutlookMeetings(
  options: OutlookMeetingsOptions = {}
): Promise<OutlookMeeting[]> {
  const { days = 1, from = new Date() } = options

  const start = new Date(from)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + days)

  const suffix = Math.random().toString(36).slice(2, 8)
  const tmpScript = path.join(os.tmpdir(), `outlook-meetings-${Date.now()}-${process.pid}-${suffix}.ps1`)
  await fs.writeFile(tmpScript, buildScript(start.toISOString(), end.toISOString()), "utf8")

  try {
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", tmpScript],
      { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
    )

    const raw = stdout.trim()
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const arr = (Array.isArray(parsed) ? parsed : parsed ? [parsed] : []) as OutlookMeeting[]

    const fromMs = start.getTime()
    const toMs = end.getTime()
    return arr.filter(m => {
      const t = Date.parse(m.start)
      return Number.isFinite(t) && t >= fromMs && t < toMs
    })
  } finally {
    await fs.unlink(tmpScript).catch(() => { /* ignore */ })
  }
}

/**
 * Same as `getOutlookMeetings` but returns an empty array instead of throwing
 * when Outlook is unavailable or the query fails.
 */
export async function getOutlookMeetingsSafe(
  options: OutlookMeetingsOptions = {}
): Promise<OutlookMeeting[]> {
  try {
    return await getOutlookMeetings(options)
  } catch {
    return []
  }
}
