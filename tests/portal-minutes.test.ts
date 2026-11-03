import { describe, expect, it } from "vitest"
import {
  exactPortalMinutes,
  summarizePortalDay,
} from "../src/lib/portal-minutes"
import { estimatePortalTotalMinutes } from "../src/lib/portal-estimate"
import { pairPunches, workingMinutes } from "../src/lib/playground"
import type {
  EntrySource,
  EntryTrigger,
  PortalData,
  PortalEntry,
  PunchEntry,
} from "../src/lib/types"

const SOURCE: EntrySource = "manual"
const TRIGGER: EntryTrigger = "via manual"

const at = (h: number, min: number, sec = 0) =>
  new Date(2026, 10, 2, h, min, sec, 0)
const iso = (h: number, min: number, sec = 0) => at(h, min, sec).toISOString()
const minutesOf = (fromIso: string, toIso: string) =>
  (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000

function entry(intime: string, outtime: string | null): PortalEntry {
  return {
    empid: 1,
    logdate: iso(0, 0),
    intime,
    outtime,
    workingmins: outtime === null ? null : minutesOf(intime, outtime),
    ismanual: 0,
  }
}

function portalData(entries: PortalEntry[], now: number): PortalData {
  return { success: true, entries, ...summarizePortalDay(entries, now) }
}

const secondPrecisionDay = [
  entry(iso(9, 2, 41), iso(13, 0, 17)),
  entry(iso(13, 45, 5), iso(16, 53, 9)),
]

describe("summarizePortalDay", () => {
  it("floors the exact sum once, like the portal UI", () => {
    const now = at(18, 0).getTime()
    const exact = 237.6 + 188.0666666666667
    expect(exactPortalMinutes(secondPrecisionDay, now)).toBeCloseTo(exact, 9)
    expect(summarizePortalDay(secondPrecisionDay, now)).toEqual({
      totalMinutes: 425,
      isCurrentlyIn: false,
      lastInTime: null,
      activeSessionMinutes: 0,
    })
  })

  it("does not lose a minute to per-session flooring", () => {
    const entries = [
      entry(iso(9, 0, 0), iso(9, 10, 30)),
      entry(iso(10, 0, 0), iso(10, 10, 30)),
    ]
    expect(summarizePortalDay(entries, at(18, 0).getTime()).totalMinutes).toBe(
      21
    )
  })

  it("includes the live session exactly and floors the total", () => {
    const entries = [
      entry(iso(9, 0, 0), iso(9, 10, 30)),
      entry(iso(10, 0, 0), null),
    ]
    const summary = summarizePortalDay(entries, at(10, 20, 40).getTime())
    expect(summary.isCurrentlyIn).toBe(true)
    expect(summary.lastInTime).toBe(iso(10, 0, 0))
    expect(summary.activeSessionMinutes).toBe(20)
    expect(summary.totalMinutes).toBe(31)
  })

  it("matches the previous whole-minute results exactly", () => {
    const entries = [
      entry(iso(9, 0), iso(13, 0)),
      entry(iso(13, 30), iso(15, 45)),
      entry(iso(16, 0), null),
    ]
    const summary = summarizePortalDay(entries, at(17, 12).getTime())
    expect(summary.totalMinutes).toBe(240 + 135 + 72)
    expect(summary.activeSessionMinutes).toBe(72)
  })

  it("never returns fractional minutes", () => {
    const entries = [entry(iso(9, 2, 41), null)]
    for (let sec = 0; sec < 120; sec += 7) {
      const summary = summarizePortalDay(entries, at(12, 0, sec).getTime())
      expect(Number.isInteger(summary.totalMinutes)).toBe(true)
      expect(Number.isInteger(summary.activeSessionMinutes)).toBe(true)
    }
  })
})

describe("estimatePortalTotalMinutes", () => {
  it("adds local work to the exact closed minutes and floors once", () => {
    const entries = [
      entry(iso(9, 0, 0), iso(9, 10, 30)),
      entry(iso(10, 0, 0), iso(10, 10, 30)),
    ]
    const now = at(11, 0, 0).getTime()
    const login: PunchEntry = {
      id: 1,
      timestamp: iso(10, 30, 0),
      date: "2026-11-02",
      type: "LOGIN",
      source: SOURCE,
      trigger: TRIGGER,
      notes: null,
      created_at: iso(10, 30, 0),
      modified_at: null,
    }
    const estimate = estimatePortalTotalMinutes(
      portalData(entries, now),
      [login],
      now
    )
    expect(estimate).toBe(51)
  })

  it("keeps the live portal session out of the closed minutes", () => {
    const entries = [
      entry(iso(9, 0, 0), iso(9, 10, 30)),
      entry(iso(10, 0, 30), null),
    ]
    const now = at(10, 30, 0).getTime()
    const estimate = estimatePortalTotalMinutes(
      portalData(entries, now),
      [],
      now
    )
    expect(estimate).toBe(Math.floor(10.5 + 29.5))
  })
})

describe("playground workingMinutes", () => {
  it("sums exact session lengths before flooring", () => {
    const pair = pairPunches([
      { time: iso(9, 0, 0) },
      { time: iso(9, 10, 30) },
      { time: iso(10, 0, 0) },
      { time: iso(10, 10, 30) },
    ])
    expect(workingMinutes(pair)).toBe(21)
  })
})
