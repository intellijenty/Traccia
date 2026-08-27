// Per-run diagnostics for EOD generation.
//
// Until now a failed run left nothing behind: the prompt that was sent, what
// came back and where it went wrong all vanished with the process, so any
// report of "the EOD was wrong today" was unreproducible. Each run writes one
// JSON file under userData/eod-ai-logs, and only the most recent few are kept.
//
// Everything here is best-effort: diagnostics must never be able to fail a run.

import { app } from 'electron'
import { promises as fs } from 'fs'
import { mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/** Runs to keep. These files hold whole prompts, so they are not small. */
const MAX_RUNS = 5

export interface RunLog {
  /** Absolute path the log will be written to. */
  readonly path: string
  /** Merge fields into the log. Cheap; nothing touches disk. */
  set(patch: Record<string, unknown>): void
  /** Persist. Safe to call repeatedly — the file is overwritten. */
  write(): void
}

function logDir(): string {
  let base: string
  try {
    base = app.getPath('userData')
  } catch {
    base = tmpdir()
  }
  const dir = join(base, 'eod-ai-logs')
  try { mkdirSync(dir, { recursive: true }) } catch { /* already there */ }
  return dir
}

/** Keep the newest MAX_RUNS logs; filenames sort chronologically by design. */
async function prune(dir: string): Promise<void> {
  try {
    const files = (await fs.readdir(dir)).filter(f => f.endsWith('.json')).sort()
    for (const stale of files.slice(0, Math.max(0, files.length - MAX_RUNS))) {
      await fs.unlink(join(dir, stale)).catch(() => { /* raced */ })
    }
  } catch { /* unreadable dir — nothing to prune */ }
}

export function startRunLog(requestId: string, kind: 'generate' | 'refine'): RunLog {
  const startedAt = new Date()
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-')
  const dir = logDir()
  const path = join(dir, `${stamp}-${kind}-${requestId.slice(0, 8)}.json`)

  const data: Record<string, unknown> = {
    requestId,
    kind,
    startedAt: startedAt.toISOString(),
    appVersion: (() => { try { return app.getVersion() } catch { return 'unknown' } })(),
  }

  // Writes are serialised. A run writes at least twice - once the prompt is
  // built, once at the end - and two unsequenced writes can land in either
  // order, which would leave the earlier snapshot on disk and lose exactly the
  // failure detail the log exists to capture.
  let queue: Promise<void> = Promise.resolve()

  return {
    path,
    set(patch) {
      Object.assign(data, patch)
    },
    write() {
      const payload = JSON.stringify({ ...data, writtenAt: new Date().toISOString() }, null, 2)
      queue = queue
        .then(() => fs.writeFile(path, payload, 'utf8'))
        .then(() => prune(dir))
        .catch(() => { /* diagnostics are never worth failing a run for */ })
    },
  }
}
