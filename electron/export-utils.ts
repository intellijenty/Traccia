import type { DBEntry } from "./database"

const CSV_HEADERS = ["date", "timestamp", "type", "created_at"] as const

function escapeCsvCell(value: string | null): string {
  if (value === null || value === undefined) return ""
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function formatDBEntriesAsCSV(entries: DBEntry[]): string {
  const header = CSV_HEADERS.join(",")
  const rows = [...entries]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((e) => CSV_HEADERS.map((col) => escapeCsvCell(e[col] as string | null)).join(","))
  return [header, ...rows].join("\r\n")
}

export function formatDBEntriesAsJSON(entries: DBEntry[]): string {
  const slim = [...entries]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map(({ date, timestamp, type, created_at }) => ({ date, timestamp, type, created_at }))
  return JSON.stringify(slim, null, 2)
}
