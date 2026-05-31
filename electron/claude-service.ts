import { spawn, execFile } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ErrorCode =
  | 'not-installed'
  | 'not-authenticated'
  | 'rate-limited'
  | 'timeout'
  | 'cancelled'
  | 'empty-response'
  | 'unknown'

export type GenerateResult =
  | { ok: true; text: string; durationMs: number }
  | { ok: false; error: string; code: ErrorCode }

export type GenerateOptions = {
  prompt: string
  systemPrompt?: string
  model?: string
  timeoutMs?: number
  requestId?: string
}

export type AvailabilityResult = {
  available: boolean
  version?: string
  error?: string
}

type StreamCallbacks = {
  onChunk: (chunk: string) => void
}

// ── Internal: stream-json message shapes from claude -p ───────────────────────

type AssistantMessage = {
  type: 'assistant'
  message: {
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'thinking'; thinking: string }
    >
  }
}

type ResultMessage = {
  type: 'result'
  subtype: 'success' | 'error_max_turns' | 'error_during_execution'
  result: string
  is_error: boolean
  duration_ms: number
  error?: string
}

type RateLimitMessage = {
  type: 'rate_limit_event'
  rate_limit_info: { status: string }
}

type StreamMessage = AssistantMessage | ResultMessage | RateLimitMessage | { type: string; [k: string]: unknown }

// ── Helpers ───────────────────────────────────────────────────────────────────

function killProcessTree(pid: number): void {
  // /F = force, /T = kill entire child tree
  spawn('taskkill', ['/F', '/T', '/PID', String(pid)], {
    windowsHide: true,
    stdio: 'ignore',
  })
}

function buildArgs(options: GenerateOptions): string[] {
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--no-color',
    '--permission-mode', 'dontAsk',
  ]

  if (options.systemPrompt) {
    args.push('--append-system-prompt', options.systemPrompt)
  }

  if (options.model) {
    args.push('--model', options.model)
  }

  return args
}

function classifyStderr(stderr: string, rateLimited: boolean): ErrorCode {
  if (rateLimited) return 'rate-limited'
  const s = stderr.toLowerCase()
  if (s.includes('not logged in') || s.includes('login required') ||
      s.includes('unauthorized') || s.includes('401') || s.includes('403') ||
      s.includes('authentication')) {
    return 'not-authenticated'
  }
  if (s.includes('cancel') || s.includes('sigterm')) return 'cancelled'
  if (s.includes('rate limit') || s.includes('429')) return 'rate-limited'
  return 'unknown'
}

// ── Service ───────────────────────────────────────────────────────────────────

class ClaudeService {
  private cachedBinaryPath: string | null = null
  private activeProcesses = new Map<string, ReturnType<typeof spawn>>()

  // ── Binary detection ───────────────────────────────────────────────────────

  private async resolveBinaryPath(): Promise<string | null> {
    if (this.cachedBinaryPath) return this.cachedBinaryPath

    // Primary: confirmed install location on Windows
    const primary = join(homedir(), '.local', 'bin', 'claude.exe')
    if (existsSync(primary)) {
      this.cachedBinaryPath = primary
      return primary
    }

    // Fallback: PATH lookup via where.exe
    try {
      const found = await new Promise<string | null>((resolve) => {
        execFile('where.exe', ['claude'], { windowsHide: true, timeout: 5_000 }, (err, stdout) => {
          if (err || !stdout.trim()) return resolve(null)
          const line = stdout.trim().split('\n')[0].trim()
          resolve(line || null)
        })
      })
      if (found && existsSync(found)) {
        this.cachedBinaryPath = found
        return found
      }
    } catch { /* not found in PATH */ }

    return null
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async available(): Promise<AvailabilityResult> {
    const binPath = await this.resolveBinaryPath()
    if (!binPath) return { available: false, error: 'claude not found at ~/.local/bin/claude.exe or PATH' }

    try {
      const version = await new Promise<string>((resolve, reject) => {
        execFile(binPath, ['--version'], { timeout: 5_000, windowsHide: true }, (err, stdout) => {
          if (err) return reject(err)
          resolve(stdout.trim())
        })
      })
      return { available: true, version }
    } catch (err) {
      return { available: false, error: String(err) }
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    return this._run(options, null)
  }

  async stream(options: GenerateOptions, callbacks: StreamCallbacks): Promise<GenerateResult> {
    return this._run(options, callbacks)
  }

  cancel(requestId: string): void {
    const proc = this.activeProcesses.get(requestId)
    if (!proc) return
    this.activeProcesses.delete(requestId)
    if (proc.pid) killProcessTree(proc.pid)
  }

  cleanup(): void {
    for (const proc of this.activeProcesses.values()) {
      if (proc.pid) killProcessTree(proc.pid)
    }
    this.activeProcesses.clear()
  }

  // ── Core runner ────────────────────────────────────────────────────────────

  private async _run(options: GenerateOptions, callbacks: StreamCallbacks | null): Promise<GenerateResult> {
    const startedAt = Date.now()
    const requestId = options.requestId ?? randomUUID()
    const timeoutMs = options.timeoutMs ?? 60_000

    const binPath = await this.resolveBinaryPath()
    if (!binPath) {
      return { ok: false, error: 'Claude Code is not installed or not found', code: 'not-installed' }
    }

    return new Promise<GenerateResult>((resolve) => {
      const proc = spawn(binPath, buildArgs(options), {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env },
      })

      this.activeProcesses.set(requestId, proc)

      let settled = false
      const finish = (result: GenerateResult): void => {
        if (settled) return
        settled = true
        clearTimeout(timerId)
        this.activeProcesses.delete(requestId)
        resolve(result)
      }

      // Timeout: kill the whole process tree, not just the direct child
      const timerId = setTimeout(() => {
        if (proc.pid) killProcessTree(proc.pid)
        finish({ ok: false, error: `Timed out after ${timeoutMs}ms`, code: 'timeout' })
      }, timeoutMs)

      // ── stdout: parse NDJSON lines ──
      let stdoutBuf = ''
      let collectedText = ''
      let lastEmittedLen = 0
      let rateLimited = false

      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString('utf8')
        const lines = stdoutBuf.split('\n')
        stdoutBuf = lines.pop() ?? ''   // keep the incomplete trailing fragment

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          let msg: StreamMessage
          try { msg = JSON.parse(trimmed) } catch { continue }

          // Text chunks from assistant messages — compute delta to emit true increments
          if (msg.type === 'assistant') {
            const am = msg as AssistantMessage
            const fullText = am.message.content
              .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
              .map(b => b.text)
              .join('')

            if (fullText.length > lastEmittedLen) {
              const delta = fullText.slice(lastEmittedLen)
              callbacks?.onChunk(delta)
              lastEmittedLen = fullText.length
            }
            collectedText = fullText
          }

          if (msg.type === 'rate_limit_event') rateLimited = true

          if (msg.type === 'result') {
            const rm = msg as ResultMessage
            const durationMs = Date.now() - startedAt

            if (rm.subtype === 'success' && !rm.is_error) {
              const text = (rm.result?.trim()) || collectedText.trim()
              if (!text) {
                finish({ ok: false, error: 'Claude returned an empty response', code: 'empty-response' })
              } else {
                finish({ ok: true, text, durationMs })
              }
            } else {
              const errText = rm.error ?? `Generation failed (${rm.subtype})`
              finish({ ok: false, error: errText, code: rateLimited ? 'rate-limited' : 'unknown' })
            }
          }
        }
      })

      // ── stderr: collect for exit-code diagnosis only ──
      const stderrChunks: string[] = []
      proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk.toString('utf8')))

      // ── Process error (e.g. ENOENT if binary disappeared) ──
      proc.on('error', (err) => {
        finish({ ok: false, error: err.message, code: 'unknown' })
      })

      // ── Process exit ──
      proc.on('close', (exitCode) => {
        if (settled) return

        const stderr = stderrChunks.join('')

        if (exitCode === 0) {
          // Exited cleanly but result message never arrived (shouldn't happen, safety net)
          const text = collectedText.trim()
          const durationMs = Date.now() - startedAt
          if (text) {
            finish({ ok: true, text, durationMs })
          } else {
            finish({ ok: false, error: 'No output received', code: 'empty-response' })
          }
          return
        }

        const code = classifyStderr(stderr, rateLimited)
        const errMsg = code === 'not-authenticated'
          ? 'Not authenticated. Run `claude login` in a terminal and restart the app.'
          : code === 'rate-limited'
            ? 'Usage limit reached for this period.'
            : (stderr.trim() || `Process exited with code ${exitCode}`)

        finish({ ok: false, error: errMsg.slice(0, 400), code })
      })

      // ── Write prompt to stdin then close so claude knows input is done ──
      proc.stdin.write(options.prompt, 'utf8')
      proc.stdin.end()
    })
  }
}

export const claude = new ClaudeService()
