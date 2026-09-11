export function getYearMonth(date: string): string {
  return date.substring(0, 7)
}

export function getMonthRange(yearMonth: string): {
  start: string
  end: string
} {
  const [year, month] = yearMonth.split("-").map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return {
    start: `${yearMonth}-01`,
    end: `${yearMonth}-${String(lastDay).padStart(2, "0")}`,
  }
}

export function getMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })
}

export function shiftMonth(selectedDate: string, direction: -1 | 1): string {
  const d = new Date(selectedDate + "T00:00:00")
  const targetDay = d.getDate()
  const newMonth = d.getMonth() + direction
  const lastOfNew = new Date(d.getFullYear(), newMonth + 1, 0).getDate()
  const clamped = Math.min(targetDay, lastOfNew)
  const out = new Date(d.getFullYear(), newMonth, clamped)
  return out.toLocaleDateString("en-CA")
}

/** Returns rows of 7 date strings (Mon–Sun). Includes padding from adjacent months. */
export function getWeeksOfMonth(yearMonth: string): string[][] {
  const { start, end } = getMonthRange(yearMonth)
  const first = new Date(start + "T00:00:00")

  // Find Monday on or before the 1st
  const dow = first.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const cursor = new Date(first)
  cursor.setDate(first.getDate() + diff)

  const weeks: string[][] = []
  do {
    const week: string[] = []
    for (let i = 0; i < 7; i++) {
      week.push(cursor.toLocaleDateString("en-CA"))
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  } while (weeks[weeks.length - 1][6] < end)

  return weeks
}

export function getWeekdaysInMonth(yearMonth: string, upTo: string): string[] {
  const { start, end } = getMonthRange(yearMonth)
  const cap = end <= upTo ? end : upTo
  const dates: string[] = []
  const d = new Date(start + "T00:00:00")
  while (d.toLocaleDateString("en-CA") <= cap) {
    const dow = d.getDay()
    if (dow >= 1 && dow <= 5) {
      dates.push(d.toLocaleDateString("en-CA"))
    }
    d.setDate(d.getDate() + 1)
  }
  return dates
}
