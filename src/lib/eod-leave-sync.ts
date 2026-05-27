import type { EodFormState, EodSectionItem } from './eod-types'
import { makeId } from './eod-types'

// ── Formatting ────────────────────────────────────────────────────────────────

const ORDINAL_SUFFIXES = ['th', 'st', 'nd', 'rd']

function ordinalSuffix(day: number): string {
  const mod100 = day % 100
  const mod10 = day % 10
  return mod100 >= 11 && mod100 <= 13 ? 'th' : ORDINAL_SUFFIXES[mod10] ?? 'th'
}

function parseLocal(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}

function formatRangeText(startStr: string, endStr: string): string {
  const s = parseLocal(startStr)
  const e = parseLocal(endStr)
  const sDay = s.getDate()
  const eDay = e.getDate()
  const sMonth = s.toLocaleString('en-US', { month: 'long' })
  const eMonth = e.toLocaleString('en-US', { month: 'long' })
  const sYear = s.getFullYear()
  const eYear = e.getFullYear()

  if (startStr === endStr) {
    // Single day: "29th May 2026"
    return `${sDay}${ordinalSuffix(sDay)} ${sMonth} ${sYear}`
  }

  if (sYear !== eYear) {
    // Different years: "29th Dec 2026 – 2nd Jan 2027"
    return `${sDay}${ordinalSuffix(sDay)} ${sMonth} ${sYear} – ${eDay}${ordinalSuffix(eDay)} ${eMonth} ${eYear}`
  }

  if (sMonth !== eMonth) {
    // Same year, different months: "29th May – 2nd Jun 2026"
    const sMonthShort = s.toLocaleString('en-US', { month: 'short' })
    const eMonthShort = e.toLocaleString('en-US', { month: 'short' })
    return `${sDay}${ordinalSuffix(sDay)} ${sMonthShort} - ${eDay}${ordinalSuffix(eDay)} ${eMonthShort} ${eYear}`
  }

  // Same month + year: "29th – 31st May 2026"
  return `${sDay}${ordinalSuffix(sDay)} - ${eDay}${ordinalSuffix(eDay)} ${sMonth} ${sYear}`
}

// ── Grouping ──────────────────────────────────────────────────────────────────

/** Groups sorted YYYY-MM-DD dates into consecutive ranges: [startDate, endDate][] */
function groupConsecutive(dates: string[]): Array<[string, string]> {
  if (dates.length === 0) return []
  const groups: Array<[string, string]> = []
  let start = dates[0]
  let prev = dates[0]

  for (let i = 1; i < dates.length; i++) {
    const curr = dates[i]
    const next = new Date(prev + 'T00:00:00')
    next.setDate(next.getDate() + 1)
    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
    if (nextStr === curr) {
      prev = curr  // extend current group
    } else {
      groups.push([start, prev])
      start = curr
      prev = curr
    }
  }
  groups.push([start, prev])
  return groups
}

// ── Reconciliation ────────────────────────────────────────────────────────────

/**
 * Pure function — merges approved leave dates into the upcomingHolidays section.
 *
 * Consecutive dates are collapsed into a single range item (e.g. "29th – 31st May 2026").
 * Uses `leaveKey` (format: "YYYY-MM-DD/YYYY-MM-DD") for identity.
 * Strategy: clear all existing leave items, re-add regrouped ranges from scratch.
 * User-entered items (no leaveKey) are untouched.
 *
 * @param state         Current EOD form state
 * @param incomingDates YYYY-MM-DD dates within look-ahead window (sorted)
 */
export function applyLeavesSync(
  state: EodFormState,
  incomingDates: string[],
): EodFormState {
  // Keep user-entered items (no leaveKey); always recompute system leave items
  const userItems = state.upcomingHolidays.items.filter(i => !i.leaveKey)

  // Group consecutive dates → one item per range
  const ranges = groupConsecutive(incomingDates)
  const newItems: EodSectionItem[] = ranges.map(([start, end]) => ({
    id: makeId(),
    text: formatRangeText(start, end),
    leaveKey: `${start}/${end}`,
  }))

  const updatedItems = [...userItems, ...newItems]

  return {
    ...state,
    upcomingHolidays: {
      items: updatedItems,
      isNA: updatedItems.length > 0 ? false : state.upcomingHolidays.isNA,
    },
  }
}
