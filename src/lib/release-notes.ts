import CHANGELOG_RAW from "../../public/release-notes.md?raw"

export { CHANGELOG_RAW }

export function extractVersionNotes(version: string): string | null {
  const escaped = version.replace(/\./g, "\\.")
  const parts = CHANGELOG_RAW.split(/(?=^## )/m)
  const section = parts.find((s) => new RegExp(`^## v?${escaped}\\b`).test(s))
  return section?.trim() ?? null
}
