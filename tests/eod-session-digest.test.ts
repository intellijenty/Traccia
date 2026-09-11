import { describe, expect, it } from "vitest"
import {
  TRACCIA_EOD_SENTINEL,
  digestFile,
  isNoiseCommand,
  splitHeadTail,
} from "../electron/eod-session-digest"
import { assistantLine, text, toolUse, userLine } from "./helpers"

const DAY_START = new Date("2026-08-26T04:00:00.000Z").getTime()
const AT = (iso: string) => ({ timestamp: iso })
const TODAY = "2026-08-26T10:00:00.000Z"
const YESTERDAY = "2026-08-25T10:00:00.000Z"

/** Long enough to count as an outcome statement rather than an acknowledgement. */
const summary = (s: string) => s.padEnd(45, ".")

function file(...lines: string[]): string {
  return lines.join("\n")
}

describe("splitHeadTail", () => {
  it("keeps everything when under the cap", () => {
    expect(splitHeadTail([1, 2, 3], 5, 2)).toEqual({
      head: [1, 2, 3],
      tail: [],
      omitted: 0,
    })
  })

  it("keeps the start and the most recent, dropping the middle", () => {
    // The point: a plain FIFO cap silently discards the afternoon of work, which
    // is the part an EOD is actually about.
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(splitHeadTail(items, 4, 2)).toEqual({
      head: [1, 2],
      tail: [9, 10],
      omitted: 6,
    })
  })

  it("always leaves room for at least one recent item", () => {
    const result = splitHeadTail([1, 2, 3, 4, 5], 3, 99)
    expect(result.head).toEqual([1, 2])
    expect(result.tail).toEqual([5])
  })

  it("handles a cap of one", () => {
    expect(splitHeadTail([1, 2, 3], 1, 1)).toEqual({
      head: [],
      tail: [3],
      omitted: 2,
    })
  })
})

describe("isNoiseCommand", () => {
  it.each([
    "ls -la",
    "cat file.txt",
    "pwd",
    "wc -l x",
    "grep foo .",
    "which node",
  ])("treats %s as inspection", (cmd) => expect(isNoiseCommand(cmd)).toBe(true))

  it.each([
    "git status",
    "git log --oneline",
    "git diff HEAD",
    "git rev-parse HEAD",
  ])("treats %s as inspection", (cmd) => expect(isNoiseCommand(cmd)).toBe(true))

  it.each([
    "npm test",
    "git commit -m x",
    "git push",
    "npx vitest run",
    "mvn package",
  ])("treats %s as real work", (cmd) => expect(isNoiseCommand(cmd)).toBe(false))

  it("looks past a leading directory change", () => {
    expect(isNoiseCommand("cd /repo && ls")).toBe(true)
    expect(isNoiseCommand("cd /repo && npm test")).toBe(false)
  })

  it("treats an empty command as noise", () => {
    expect(isNoiseCommand("   ")).toBe(true)
  })
})

describe("digestFile", () => {
  it("returns null when the file holds nothing from today", () => {
    expect(
      digestFile(file(userLine("old work", AT(YESTERDAY))), DAY_START)
    ).toBeNull()
  })

  it("returns null for an empty file", () => {
    expect(digestFile("", DAY_START)).toBeNull()
  })

  it("ignores lines older than the day boundary", () => {
    const digest = digestFile(
      file(userLine("yesterday", AT(YESTERDAY)), userLine("today", AT(TODAY))),
      DAY_START
    )
    expect(digest!.userPrompts).toEqual(["today"])
  })

  it("skips corrupt lines instead of failing the file", () => {
    const digest = digestFile(
      file("{not json", "", userLine("today", AT(TODAY))),
      DAY_START
    )
    expect(digest!.userPrompts).toEqual(["today"])
  })

  it("skips sidechain and meta lines", () => {
    const digest = digestFile(
      file(
        userLine("subagent chatter", { ...AT(TODAY), isSidechain: true }),
        userLine("meta", { ...AT(TODAY), isMeta: true }),
        userLine("real prompt", AT(TODAY))
      ),
      DAY_START
    )
    expect(digest!.userPrompts).toEqual(["real prompt"])
  })

  it("records the working directory and branch", () => {
    const digest = digestFile(
      file(
        userLine("work", {
          ...AT(TODAY),
          cwd: "C:/repos/app",
          gitBranch: "feature/ATON-1",
        })
      ),
      DAY_START
    )
    expect(digest!.cwd).toBe("C:/repos/app")
    expect(digest!.gitBranch).toBe("feature/ATON-1")
  })

  it("records the first and last timestamps seen", () => {
    const digest = digestFile(
      file(
        userLine("first", AT("2026-08-26T09:00:00.000Z")),
        userLine("last", AT("2026-08-26T17:30:00.000Z"))
      ),
      DAY_START
    )
    expect(digest!.startedAt).toBe("2026-08-26T09:00:00.000Z")
    expect(digest!.endedAt).toBe("2026-08-26T17:30:00.000Z")
  })

  it("discards the whole file when it is one of our own generation runs", () => {
    const digest = digestFile(
      file(userLine(TRACCIA_EOD_SENTINEL + " analyse my day", AT(TODAY))),
      DAY_START
    )
    expect(digest).toBeNull()
  })

  describe("user prompts", () => {
    it("reads a prompt given as plain text", () => {
      const digest = digestFile(
        file(userLine("fix the bug", AT(TODAY))),
        DAY_START
      )
      expect(digest!.userPrompts).toEqual(["fix the bug"])
    })

    it("reads a prompt given as text blocks", () => {
      const digest = digestFile(
        file(
          JSON.stringify({
            type: "user",
            timestamp: TODAY,
            message: { role: "user", content: [text("fix the bug")] },
          })
        ),
        DAY_START
      )
      expect(digest!.userPrompts).toEqual(["fix the bug"])
    })

    it("ignores lines that only carry tool results", () => {
      const digest = digestFile(
        file(
          JSON.stringify({
            type: "user",
            timestamp: TODAY,
            message: {
              role: "user",
              content: [{ type: "tool_result", content: "output" }],
            },
          }),
          userLine("real prompt", AT(TODAY))
        ),
        DAY_START
      )
      expect(digest!.userPrompts).toEqual(["real prompt"])
    })

    it.each([
      ["injected command wrappers", "<command-name>clear</command-name>"],
      ["system reminders", "<system-reminder>note</system-reminder>"],
      ["caveats", "Caveat: the messages below were generated"],
      ["interruptions", "[Request interrupted by user]"],
    ])("drops %s", (_label, content) => {
      const digest = digestFile(
        file(userLine(content, AT(TODAY)), userLine("real prompt", AT(TODAY))),
        DAY_START
      )
      expect(digest!.userPrompts).toEqual(["real prompt"])
    })
  })

  describe("assistant summaries", () => {
    it("keeps only the last statement of a turn", () => {
      // Within a turn the assistant narrates before reporting; only the final
      // statement says what was actually accomplished.
      const digest = digestFile(
        file(
          userLine("fix the bug", AT(TODAY)),
          assistantLine([text(summary("Let me look at the file"))], AT(TODAY)),
          assistantLine([text(summary("Now I will run the tests"))], AT(TODAY)),
          assistantLine(
            [text(summary("Fixed the rounding bug and added a test"))],
            AT(TODAY)
          )
        ),
        DAY_START
      )
      expect(digest!.assistantSummaries).toEqual([
        summary("Fixed the rounding bug and added a test"),
      ])
    })

    it("keeps one statement per turn", () => {
      const digest = digestFile(
        file(
          userLine("first task", AT(TODAY)),
          assistantLine([text(summary("Did the first thing"))], AT(TODAY)),
          userLine("second task", AT(TODAY)),
          assistantLine([text(summary("Did the second thing"))], AT(TODAY))
        ),
        DAY_START
      )
      expect(digest!.assistantSummaries).toEqual([
        summary("Did the first thing"),
        summary("Did the second thing"),
      ])
    })

    it("drops short acknowledgements", () => {
      const digest = digestFile(
        file(
          userLine("fix it", AT(TODAY)),
          assistantLine(
            [text(summary("Fixed it properly and verified"))],
            AT(TODAY)
          ),
          assistantLine([text("Done.")], AT(TODAY))
        ),
        DAY_START
      )
      expect(digest!.assistantSummaries).toEqual([
        summary("Fixed it properly and verified"),
      ])
    })
  })

  describe("tool use", () => {
    it("records files that were changed, not files that were read", () => {
      const digest = digestFile(
        file(
          userLine("work", AT(TODAY)),
          assistantLine(
            [
              toolUse("Read", { file_path: "src/glanced-at.ts" }),
              toolUse("Grep", { file_path: "src/searched.ts" }),
              toolUse("Edit", { file_path: "src/edited.ts" }),
              toolUse("Write", { file_path: "src/written.ts" }),
              toolUse("NotebookEdit", { notebook_path: "nb.ipynb" }),
            ],
            AT(TODAY)
          )
        ),
        DAY_START
      )
      expect(digest!.filesChanged).toEqual([
        "src/edited.ts",
        "src/written.ts",
        "nb.ipynb",
      ])
    })

    it("records delegated work, which is otherwise invisible", () => {
      // A sub-agent writes its own lines as sidechains, which get dropped, so
      // the brief sent from the parent thread is the only trace left.
      const digest = digestFile(
        file(
          userLine("work", AT(TODAY)),
          assistantLine(
            [
              toolUse("Task", {
                description: "Audit the API",
                prompt: "Check every endpoint",
              }),
            ],
            AT(TODAY)
          )
        ),
        DAY_START
      )
      expect(digest!.delegations).toEqual([
        "Audit the API: Check every endpoint",
      ])
    })

    it("keeps a delegation that has only a description", () => {
      const digest = digestFile(
        file(
          userLine("work", AT(TODAY)),
          assistantLine(
            [toolUse("Task", { description: "Audit the API" })],
            AT(TODAY)
          )
        ),
        DAY_START
      )
      expect(digest!.delegations).toEqual(["Audit the API"])
    })

    it("records commands that do something and drops the ones that only look", () => {
      const digest = digestFile(
        file(
          userLine("work", AT(TODAY)),
          assistantLine(
            [
              toolUse("Bash", { command: "ls -la" }),
              toolUse("Bash", { command: "git status" }),
              toolUse("Bash", { command: "npm test" }),
            ],
            AT(TODAY)
          )
        ),
        DAY_START
      )
      expect(digest!.commands).toEqual(["npm test"])
    })

    it("de-duplicates repeated commands and files", () => {
      const digest = digestFile(
        file(
          userLine("work", AT(TODAY)),
          assistantLine(
            [
              toolUse("Bash", { command: "npm test" }),
              toolUse("Bash", { command: "npm test" }),
              toolUse("Edit", { file_path: "src/a.ts" }),
              toolUse("Edit", { file_path: "src/a.ts" }),
            ],
            AT(TODAY)
          )
        ),
        DAY_START
      )
      expect(digest!.commands).toEqual(["npm test"])
      expect(digest!.filesChanged).toEqual(["src/a.ts"])
    })
  })

  describe("caps", () => {
    it("marks how many prompts were left out", () => {
      const lines = Array.from({ length: 40 }, (_, i) =>
        userLine("prompt " + i, AT(TODAY))
      )
      const digest = digestFile(file(...lines), DAY_START)
      expect(digest!.userPrompts).toHaveLength(26) // 25 kept plus the gap marker
      expect(
        digest!.userPrompts.some((p) => p.includes("earlier prompts omitted"))
      ).toBe(true)
      expect(digest!.userPrompts[0]).toBe("prompt 0")
      expect(digest!.userPrompts.at(-1)).toBe("prompt 39")
    })

    it("truncates an over-long prompt", () => {
      const digest = digestFile(
        file(userLine("x".repeat(900), AT(TODAY))),
        DAY_START
      )
      expect(digest!.userPrompts[0].length).toBeLessThanOrEqual(401)
      expect(digest!.userPrompts[0].endsWith("\u2026")).toBe(true)
    })
  })
})
