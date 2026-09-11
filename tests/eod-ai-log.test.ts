import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

// The only thing this module needs from Electron is where to put the file.
const base = mkdtempSync(join(tmpdir(), "traccia-log-"))
vi.mock("electron", () => ({
  app: { getPath: () => base, getVersion: () => "0.0.0-test" },
}))

const { startRunLog } = await import("../electron/eod-ai-log")

const dir = join(base, "eod-ai-logs")
const files = () =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort()
    : []
const read = (name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"))

/** A file caught mid-write reads as empty; that is a reader problem, not a bug. */
function readOrNull(name: string): Record<string, unknown> | null {
  try {
    return read(name)
  } catch {
    return null
  }
}

/** Writes are deliberately fire-and-forget, so wait for the effect to land. */
async function settle(check: () => boolean, attempts = 50): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 20))
  }
}

/** Timestamps are second-resolution, so space runs out to keep names ordered. */
async function writeRun(id: string, patch: Record<string, unknown> = {}) {
  const log = startRunLog(id, "generate")
  log.set(patch)
  log.write()
  await new Promise((r) => setTimeout(r, 5))
  return log
}

beforeEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

afterAll(() => {
  rmSync(base, { recursive: true, force: true })
})

describe("startRunLog", () => {
  it("puts the log under the app data directory", () => {
    const log = startRunLog("abcdef01-2345-6789", "generate")
    expect(log.path.startsWith(dir)).toBe(true)
    expect(log.path.endsWith(".json")).toBe(true)
  })

  it("names the file after the run, so a user can find the right one", () => {
    const log = startRunLog("abcdef01-2345-6789", "refine")
    expect(log.path).toContain("refine")
    expect(log.path).toContain("abcdef01")
  })

  it("writes nothing until asked", async () => {
    const log = startRunLog("abcdef01", "generate")
    log.set({ gatherPrompt: "x" })
    await new Promise((r) => setTimeout(r, 50))
    expect(existsSync(log.path)).toBe(false)
  })

  it("records what the run did", async () => {
    const log = startRunLog("abcdef01", "generate")
    log.set({ gatherPrompt: "the prompt", outcome: "ok" })
    log.write()
    await settle(() => files().length === 1)

    const written = read(files()[0])
    expect(written.gatherPrompt).toBe("the prompt")
    expect(written.outcome).toBe("ok")
    expect(written.requestId).toBe("abcdef01")
    expect(written.kind).toBe("generate")
    expect(written.appVersion).toBe("0.0.0-test")
    expect(typeof written.startedAt).toBe("string")
    expect(typeof written.writtenAt).toBe("string")
  })

  it("merges everything set across the run", async () => {
    const log = startRunLog("abcdef01", "generate")
    log.set({ a: 1 })
    log.set({ b: 2 })
    log.write()
    await settle(() => files().length === 1)

    const written = read(files()[0])
    expect(written.a).toBe(1)
    expect(written.b).toBe(2)
  })

  it("overwrites rather than piling up when written more than once", async () => {
    // The orchestrator writes once the prompt is built and again at the end, so
    // a hang still leaves the prompt behind.
    const log = startRunLog("abcdef01", "generate")
    log.set({ stage: "prompt built" })
    log.write()
    await settle(() => files().length === 1)
    log.set({ stage: "finished" })
    log.write()
    await settle(() => readOrNull(files()[0])?.stage === "finished")

    expect(files()).toHaveLength(1)
    expect(read(files()[0]).stage).toBe("finished")
  })

  it("keeps only the five most recent runs", async () => {
    // These files hold whole prompts, so they are not small.
    for (let i = 0; i < 8; i++) await writeRun("run" + i, { index: i })
    await settle(() => files().length === 5)

    expect(files()).toHaveLength(5)
    const kept = files().map((f) => read(f).index)
    expect(kept).toEqual([3, 4, 5, 6, 7])
  })

  it("survives a directory it cannot write to", async () => {
    const log = startRunLog("abcdef01", "generate")
    rmSync(dir, { recursive: true, force: true })
    // Diagnostics must never be able to fail a run, so this cannot throw even
    // though the directory has gone.
    expect(() => log.write()).not.toThrow()
  })
})
