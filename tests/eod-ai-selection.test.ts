import { describe, expect, it } from "vitest"
import {
  allSelectableIds,
  hasSelectable,
  projectCheck,
  selectedCount,
  selectedSubset,
  setRange,
  toggleProject,
  toggleSectionItem,
  toggleSub,
  toggleTask,
} from "../src/lib/eod-ai-selection"
import type { EodFormState } from "../src/lib/eod-types"

/**
 * A draft with predictable ids, so tests can name the row they mean:
 *   p1 > t1 (s1, s2), t2 (s3)
 *   p2 > t3
 *   otherTasks: o1  concerns: c1  nextDayPlan: n1  holidays: h1
 */
function draft(): EodFormState {
  return {
    date: "2026-08-26",
    projects: [
      {
        id: "p1",
        name: "ATON",
        status: "green",
        statusNote: null,
        tasksCompleted: [
          {
            id: "t1",
            text: "task one",
            subBullets: [
              { id: "s1", text: "a" },
              { id: "s2", text: "b" },
            ],
          },
          { id: "t2", text: "task two", subBullets: [{ id: "s3", text: "c" }] },
        ],
      },
      {
        id: "p2",
        name: "TRAC",
        status: "green",
        statusNote: null,
        tasksCompleted: [{ id: "t3", text: "task three", subBullets: [] }],
      },
    ],
    otherTasks: { items: [{ id: "o1", text: "other" }], isNA: false },
    concerns: { items: [{ id: "c1", text: "concern" }], isNA: false },
    nextDayPlan: { items: [{ id: "n1", text: "plan" }], isNA: false },
    upcomingHolidays: { items: [{ id: "h1", text: "holiday" }], isNA: false },
  }
}

const empty = (): EodFormState => ({
  date: "2026-08-26",
  projects: [],
  otherTasks: { items: [], isNA: true },
  concerns: { items: [], isNA: true },
  nextDayPlan: { items: [], isNA: true },
  upcomingHolidays: { items: [], isNA: true },
})

describe("allSelectableIds", () => {
  it("lists every task, sub-bullet and section item in display order", () => {
    expect(allSelectableIds(draft())).toEqual([
      "t1",
      "s1",
      "s2",
      "t2",
      "s3",
      "t3",
      "o1",
      "c1",
      "n1",
    ])
  })

  it("leaves holidays out, since the app owns them", () => {
    expect(allSelectableIds(draft())).not.toContain("h1")
  })

  it("is empty for an empty draft", () => {
    expect(allSelectableIds(empty())).toEqual([])
  })
})

describe("toggleTask", () => {
  it("selecting a task brings its sub-bullets with it", () => {
    expect([...toggleTask(draft(), new Set(), "t1")].sort()).toEqual([
      "s1",
      "s2",
      "t1",
    ])
  })

  it("deselecting a task takes its sub-bullets away", () => {
    const result = toggleTask(draft(), new Set(["t1", "s1", "s2"]), "t1")
    expect([...result]).toEqual([])
  })

  it("ignores an unknown id", () => {
    expect([...toggleTask(draft(), new Set(["t1"]), "nope")]).toEqual(["t1"])
  })
})

describe("toggleSub", () => {
  it("selecting a sub-bullet also selects its parent, so it cannot be orphaned", () => {
    expect([...toggleSub(new Set(), "t1", "s1")].sort()).toEqual(["s1", "t1"])
  })

  it("deselecting a sub-bullet leaves the parent alone", () => {
    expect([...toggleSub(new Set(["t1", "s1"]), "t1", "s1")]).toEqual(["t1"])
  })
})

describe("toggleSectionItem", () => {
  it("turns an item on and off", () => {
    expect([...toggleSectionItem(new Set(), "o1")]).toEqual(["o1"])
    expect([...toggleSectionItem(new Set(["o1"]), "o1")]).toEqual([])
  })
})

describe("toggleProject", () => {
  it("selects every task and sub-bullet beneath it", () => {
    expect([...toggleProject(draft(), new Set(), "p1")].sort()).toEqual([
      "s1",
      "s2",
      "s3",
      "t1",
      "t2",
    ])
  })

  it("clears them all when everything was already selected", () => {
    const all = new Set(["t1", "s1", "s2", "t2", "s3"])
    expect([...toggleProject(draft(), all, "p1")]).toEqual([])
  })

  it("completes a partial selection rather than clearing it", () => {
    expect([...toggleProject(draft(), new Set(["t1"]), "p1")].sort()).toEqual([
      "s1",
      "s2",
      "s3",
      "t1",
      "t2",
    ])
  })

  it("leaves other projects alone", () => {
    expect([...toggleProject(draft(), new Set(["t3"]), "p1")]).toContain("t3")
  })
})

describe("projectCheck", () => {
  it("reports none when nothing is selected", () => {
    expect(projectCheck(draft(), new Set(), "p1")).toBe("none")
  })

  it("reports some when part is selected", () => {
    expect(projectCheck(draft(), new Set(["t1"]), "p1")).toBe("some")
  })

  it("reports all when every task is selected", () => {
    expect(projectCheck(draft(), new Set(["t1", "t2"]), "p1")).toBe("all")
  })

  it("reports none for a project with no tasks", () => {
    const d = draft()
    d.projects[0].tasksCompleted = []
    expect(projectCheck(d, new Set(), "p1")).toBe("none")
  })
})

describe("setRange", () => {
  it("selects every row between two rows", () => {
    expect([...setRange(draft(), new Set(), "t1", "t2", true)].sort()).toEqual([
      "s1",
      "s2",
      "t1",
      "t2",
    ])
  })

  it("works when the range is given backwards", () => {
    expect([...setRange(draft(), new Set(), "t2", "t1", true)].sort()).toEqual([
      "s1",
      "s2",
      "t1",
      "t2",
    ])
  })

  it("clears a range", () => {
    const all = new Set(allSelectableIds(draft()))
    const result = setRange(draft(), all, "t1", "s2", false)
    expect(result.has("t1")).toBe(false)
    expect(result.has("t2")).toBe(true)
  })

  it("re-attaches a parent left behind by a range clear", () => {
    // A selected sub-bullet must never be left without its task.
    const all = new Set(allSelectableIds(draft()))
    const result = setRange(draft(), all, "t1", "t1", false)
    expect(result.has("t1")).toBe(true)
  })

  it("crosses from a project into a section", () => {
    const result = setRange(draft(), new Set(), "t3", "c1", true)
    expect([...result].sort()).toEqual(["c1", "o1", "t3"])
  })

  it("does nothing when a row is unknown", () => {
    expect([...setRange(draft(), new Set(["t1"]), "nope", "t2", true)]).toEqual(
      ["t1"]
    )
  })
})

describe("selectedCount", () => {
  it("counts tasks and section items, since sub-bullets ride along", () => {
    expect(selectedCount(draft(), new Set(["t1", "s1", "s2", "o1"]))).toBe(2)
  })

  it("is zero for an empty selection", () => {
    expect(selectedCount(draft(), new Set())).toBe(0)
  })
})

describe("hasSelectable", () => {
  it("is true when there is a task", () => {
    expect(hasSelectable(draft())).toBe(true)
  })

  it("is true when there are only section items", () => {
    const d = empty()
    d.otherTasks = { items: [{ id: "o1", text: "other" }], isNA: false }
    expect(hasSelectable(d)).toBe(true)
  })

  it("is false when there is nothing to pick", () => {
    expect(hasSelectable(empty())).toBe(false)
  })
})

describe("selectedSubset", () => {
  it("keeps only the chosen tasks and sub-bullets", () => {
    const subset = selectedSubset(draft(), new Set(["t1", "s1"]))
    expect(subset.projects).toHaveLength(1)
    expect(subset.projects[0].tasksCompleted).toHaveLength(1)
    expect(subset.projects[0].tasksCompleted[0].subBullets).toEqual([
      { id: "s1", text: "a" },
    ])
  })

  it("drops a project with nothing selected", () => {
    const subset = selectedSubset(draft(), new Set(["t3"]))
    expect(subset.projects.map((p) => p.id)).toEqual(["p2"])
  })

  it("carries the project name and status across", () => {
    const subset = selectedSubset(draft(), new Set(["t1"]))
    expect(subset.projects[0].name).toBe("ATON")
    expect(subset.projects[0].status).toBe("green")
  })

  it("marks a section N/A when none of its items were chosen", () => {
    const subset = selectedSubset(draft(), new Set(["t1"]))
    expect(subset.otherTasks).toEqual({ items: [], isNA: true })
  })

  it("keeps a chosen section item", () => {
    const subset = selectedSubset(draft(), new Set(["o1"]))
    expect(subset.otherTasks.items).toEqual([{ id: "o1", text: "other" }])
    expect(subset.otherTasks.isNA).toBe(false)
  })

  it("never carries holidays, which the app owns", () => {
    const subset = selectedSubset(
      draft(),
      new Set(allSelectableIds(draft()).concat("h1"))
    )
    expect(subset.upcomingHolidays).toEqual({ items: [], isNA: true })
  })

  it("does not mutate the draft it was given", () => {
    const d = draft()
    selectedSubset(d, new Set(["t1"]))
    expect(d.projects[0].tasksCompleted).toHaveLength(2)
    expect(d.projects[0].tasksCompleted[0].subBullets).toHaveLength(2)
  })
})
