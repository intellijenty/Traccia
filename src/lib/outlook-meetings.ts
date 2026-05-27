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
  /** ISO 8601 start datetime */
  start: string
  /** Outlook ResponseStatus: 0=None, 1=Organized, 2=Tentative, 3=Accepted, 4=Declined, 5=NotResponded */
  responseStatus: number
}

export interface OutlookMeetingsOptions {
  /** How many days ahead to fetch (default: 7) */
  days?: number
  /** Start date — defaults to today */
  from?: Date
}

function buildScript(from: Date, to: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })

  return `
$outlook = New-Object -ComObject Outlook.Application
$ns = $outlook.GetNamespace("MAPI")
$cal = $ns.GetDefaultFolder(9)
$items = $cal.Items
$items.IncludeRecurrences = $true
$items.Sort("[Start]")
$filter = "[Start] >= '${fmt(from)}' AND [Start] <= '${fmt(to)}'"
$results = $items.Restrict($filter) | ForEach-Object {
    [PSCustomObject]@{
        title          = $_.Subject
        duration       = $_.Duration
        start          = $_.Start.ToString("o")
        responseStatus = $_.ResponseStatus
    }
}
if ($results) { @($results) | ConvertTo-Json } else { "[]" }
`
}

/**
 * Fetches upcoming meetings from Outlook calendar via COM automation.
 * Requires Outlook to be installed and a profile configured on this machine.
 * Only works on Windows (Electron main process or Node.js).
 */
export async function getOutlookMeetings(
  options: OutlookMeetingsOptions = {}
): Promise<OutlookMeeting[]> {
  const { days = 7, from = new Date() } = options

  const start = new Date(from)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + days)

  const tmpScript = path.join(os.tmpdir(), `outlook-meetings-${Date.now()}.ps1`)
  await fs.writeFile(tmpScript, buildScript(start, end), "utf8")

  try {
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", tmpScript],
      { encoding: "utf8", windowsHide: true }
    )

    const parsed = JSON.parse(stdout.trim())
    return (Array.isArray(parsed) ? parsed : parsed ? [parsed] : []) as OutlookMeeting[]
  } finally {
    await fs.unlink(tmpScript).catch(() => { /* ignore if already gone */ })
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
