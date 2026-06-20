import type { PunchEntry } from "@/lib/types"

export function formatEntriesAsText(entries: PunchEntry[], date: string): string {
  const sorted = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const lines = sorted.map((e) => {
    const time = new Date(e.timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })
    return `${time}  ${e.type === "LOGIN" ? "IN " : "OUT"}`
  })
  return [`Local entries — ${date}`, ...lines].join("\n")
}

export function formatEntriesAsJSON(entries: PunchEntry[]): string {
  const slim = entries
    .map(({ date, timestamp, type, created_at }) => ({ date, timestamp, type, created_at }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return JSON.stringify(slim, null, 2)
}
