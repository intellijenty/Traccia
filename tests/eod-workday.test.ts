import { describe, expect, it } from "vitest"
import {
  WORK_DAY_START_HOUR,
  effectiveDayStart,
  workDate,
} from "../src/lib/eod-workday"

/** Local-time constructor, so these tests do not depend on the machine's zone. */
const at = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0)

describe("effectiveDayStart", () => {
  it("starts the day at the configured hour", () => {
    const start = effectiveDayStart(at(2026, 8, 26, 13, 0))
    expect(start.getHours()).toBe(WORK_DAY_START_HOUR)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
    expect(start.getMilliseconds()).toBe(0)
  })

  it("never returns an instant in the future", () => {
    for (let hour = 0; hour < 24; hour++) {
      const now = at(2026, 8, 26, hour, 30)
      expect(effectiveDayStart(now).getTime()).toBeLessThanOrEqual(
        now.getTime()
      )
    }
  })

  it("rolls back a day when the clock is before the boundary", () => {
    // Only observable when the boundary is not midnight; with hour 0 the guard
    // is inert, and asserting it directly keeps the intent visible if the
    // constant is ever changed back to 4.
    const now = at(2026, 8, 26, 1, 30)
    const start = effectiveDayStart(now)
    const expectedDay = WORK_DAY_START_HOUR > 1 ? 25 : 26
    expect(start.getDate()).toBe(expectedDay)
  })
})

describe("workDate", () => {
  it("labels a normal working hour with that calendar day", () => {
    expect(workDate(at(2026, 8, 26, 13, 0))).toBe("2026-08-26")
  })

  it("still labels late evening with the same day", () => {
    expect(workDate(at(2026, 8, 26, 23, 50))).toBe("2026-08-26")
  })

  it("crosses to the next day at the boundary", () => {
    expect(workDate(at(2026, 8, 27, 0, 10))).toBe("2026-08-27")
  })

  it("pads single-digit months and days", () => {
    expect(workDate(at(2026, 1, 5, 12, 0))).toBe("2026-01-05")
  })
})

describe("the invariant that was broken", () => {
  // The evidence window (main process) and the date label (renderer) used to be
  // computed by different rules, so a draft written at 23:50 was discarded at
  // 00:01 and a run at 01:00 was stamped with the wrong date. Whatever the
  // boundary is set to, these two must describe the same day.
  it("agrees at every half hour of the day", () => {
    for (let hour = 0; hour < 24; hour++) {
      for (const minute of [0, 30, 59]) {
        const now = at(2026, 8, 26, hour, minute)
        expect(effectiveDayStart(now).toLocaleDateString("en-CA")).toBe(
          workDate(now)
        )
      }
    }
  })

  it("agrees across a month boundary", () => {
    for (const now of [at(2026, 8, 31, 23, 59), at(2026, 9, 1, 0, 1)]) {
      expect(effectiveDayStart(now).toLocaleDateString("en-CA")).toBe(
        workDate(now)
      )
    }
  })

  it("agrees across a year boundary", () => {
    for (const now of [at(2026, 12, 31, 23, 59), at(2027, 1, 1, 0, 1)]) {
      expect(effectiveDayStart(now).toLocaleDateString("en-CA")).toBe(
        workDate(now)
      )
    }
  })
})
