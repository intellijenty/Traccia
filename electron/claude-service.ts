import { spawn, execFile } from "child_process"
import { existsSync, mkdirSync, readFileSync } from "fs"
import { homedir, tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"
import { app } from "electron"

// ── Types ─────────────────────────────────────────────────────────────────────

export type ErrorCode =
  | "not-installed"
  | "not-authenticated"
  | "rate-limited"
  | "timeout"
  | "cancelled"
  | "empty-response"
  | "unknown"

export type GenerateResult =
  | {
      ok: true
      text: string
      durationMs: number
      /** Present when `jsonSchema` was supplied — already-parsed, schema-valid
       *  output. Callers should prefer this over re-parsing `text`. */
      structured?: unknown
    }
  | { ok: false; error: string; code: ErrorCode }

/**
 * Which slice of the user's Claude Code environment a run needs.
 *
 * 'gather'  Needs the user's claude.ai MCP connectors (Jira is an account-level
 *           connector, not a file-based server — `--mcp-config` cannot recreate
 *           it), so user settings must load. Plugins, hooks and bundled skills
 *           are force-disabled on top via `--settings`, otherwise the user's own
 *           SessionStart/UserPromptSubmit hooks and plugins inject instructions
 *           into our prompt (verified: the caveman plugin was rewriting the
 *           analyst's output style).
 * 'write'   Needs no tools and no MCP at all — load nothing.
 */
export type ClaudeProfile = "gather" | "write"

export type GenerateOptions = {
  prompt: string
  systemPrompt?: string
  model?: string
  /** Comma-separated fallbacks used when the primary model is overloaded. */
  fallbackModel?: string
  timeoutMs?: number
  requestId?: string
  profile?: ClaudeProfile
  /** Built-in tool allowlist. '' disables every built-in tool. */
  tools?: string
  /** JSON Schema enforced by the CLI on the final response. */
  jsonSchema?: object
}

export type AvailabilityResult = {
  available: boolean
  version?: string
  error?: string
}

type StreamCallbacks = {
  onChunk: (chunk: string) => void
  /** Fired once per tool invocation the agent makes (tool name, e.g. "Read",
   *  "mcp__atlassian__searchJiraIssuesUsingJql"). Used for progress UI. */
  onToolUse?: (toolName: string) => void
}

// ── Internal: stream-json message shapes from claude -p ───────────────────────

type AssistantMessage = {
  type: "assistant"
  message: {
    content: Array<
      | { type: "text"; text: string }
      | { type: "thinking"; thinking: string }
      | { type: "tool_use"; name: string; input?: unknown }
    >
  }
}

type ResultMessage = {
  type: "result"
  subtype: "success" | "error_max_turns" | "error_during_execution"
  result: string
  is_error: boolean
  duration_ms: number
  error?: string
  /** Parsed, schema-valid payload — present when --json-schema was passed. */
  structured_output?: unknown
}

type RateLimitMessage = {
  type: "rate_limit_event"
  rate_limit_info: { status: string }
}

type StreamMessage =
  | AssistantMessage
  | ResultMessage
  | RateLimitMessage
  | { type: string; [k: string]: unknown }

// ── Helpers ───────────────────────────────────────────────────────────────────

function killProcessTree(pid: number): void {
  // /F = force, /T = kill entire child tree
  spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
    windowsHide: true,
    stdio: "ignore",
  })
}

/**
 * Settings overlay for the 'gather' profile: strip every user plugin, every
 * hook and the bundled skills while still loading user settings (which is what
 * makes the claude.ai MCP connectors available). Pinning the effort level keeps
 * run duration predictable instead of inheriting the user's interactive default.
 */
/** Tool-name prefix the CLI derives from a claude.ai connector's display name. */
function connectorPrefix(displayName: string): string {
  return "mcp__" + displayName.replace(/[^A-Za-z0-9]+/g, "_")
}

/**
 * Deny every claude.ai connector except the ticket-tracking ones. Connectors are
 * account-level, so `--mcp-config`/`--strict-mcp-config` cannot scope them —
 * a permission deny list is the only lever, and it does prune the advertised
 * tool set (measured: 102 tools → 45).
 */
function unwantedConnectors(): string[] {
  try {
    const raw = readFileSync(join(homedir(), ".claude.json"), "utf8")
    const parsed = JSON.parse(raw) as { claudeAiMcpEverConnected?: unknown }
    const names = Array.isArray(parsed.claudeAiMcpEverConnected)
      ? parsed.claudeAiMcpEverConnected.filter(
          (n): n is string => typeof n === "string"
        )
      : []
    return names.filter((n) => !/atlassian|jira/i.test(n)).map(connectorPrefix)
  } catch {
    return []
  }
}

function isolationSettings(): string {
  const enabledPlugins: Record<string, boolean> = {}
  const deny = new Set(unwantedConnectors())
  try {
    const raw = readFileSync(
      join(homedir(), ".claude", "settings.json"),
      "utf8"
    )
    const parsed = JSON.parse(raw) as {
      enabledPlugins?: Record<string, unknown>
      permissions?: { deny?: unknown }
    }
    for (const name of Object.keys(parsed.enabledPlugins ?? {}))
      enabledPlugins[name] = false
    // Our `permissions` block replaces the user's, so carry their denials over —
    // dropping them would grant the analyst MORE access than the user allows.
    const userDeny = parsed.permissions?.deny
    if (Array.isArray(userDeny)) {
      for (const rule of userDeny) if (typeof rule === "string") deny.add(rule)
    }
  } catch {
    /* no user settings file — nothing to switch off */
  }
  return JSON.stringify({
    enabledPlugins,
    hooks: {},
    disableBundledSkills: true,
    effortLevel: "medium",
    permissions: { deny: Array.from(deny) },
  })
}

/**
 * A dedicated empty working directory. Without it the CLI inherits Electron's
 * cwd, which pulls Traccia's own CLAUDE.md and git status into the system
 * prompt of every run.
 */
function scratchDir(): string {
  let base: string
  try {
    base = app.getPath("userData")
  } catch {
    base = tmpdir() // app not ready (tests / early startup)
  }
  const dir = join(base, "ai-scratch")
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* already there */
  }
  return dir
}

function buildArgs(options: GenerateOptions): string[] {
  // NOTE: no '--no-color' — removed from the CLI (rejected as unknown option
  // since at least v2.1.x). '--verbose' is required for stream-json in -p mode.
  const profile = options.profile ?? "write"
  const args = [
    "-p",
    "--verbose",
    "--output-format",
    "stream-json",
    "--permission-mode",
    "dontAsk",
    // Our runs are not conversations: never write a transcript. This also stops
    // generation runs from landing in ~/.claude/projects and polluting the next
    // day's session digest.
    "--no-session-persistence",
    "--disable-slash-commands",
    // Keeps per-machine sections out of the system prompt so the cache is
    // reusable across runs.
    "--exclude-dynamic-system-prompt-sections",
  ]

  if (profile === "gather") {
    args.push("--setting-sources", "user", "--settings", isolationSettings())
  } else {
    args.push("--setting-sources", "")
  }

  if (options.tools !== undefined) {
    args.push("--tools", options.tools)
  }

  if (options.jsonSchema) {
    args.push("--json-schema", JSON.stringify(options.jsonSchema))
  }

  if (options.systemPrompt) {
    args.push("--append-system-prompt", options.systemPrompt)
  }

  if (options.model) {
    args.push("--model", options.model)
  }

  if (options.fallbackModel) {
    args.push("--fallback-model", options.fallbackModel)
  }

  return args
}

function classifyStderr(stderr: string, rateLimited: boolean): ErrorCode {
  if (rateLimited) return "rate-limited"
  const s = stderr.toLowerCase()
  if (
    s.includes("not logged in") ||
    s.includes("login required") ||
    s.includes("unauthorized") ||
    s.includes("401") ||
    s.includes("403") ||
    s.includes("authentication")
  ) {
    return "not-authenticated"
  }
  if (s.includes("cancel") || s.includes("sigterm")) return "cancelled"
  if (s.includes("rate limit") || s.includes("429")) return "rate-limited"
  return "unknown"
}

// ── Service ───────────────────────────────────────────────────────────────────

class ClaudeService {
  private cachedBinaryPath: string | null = null
  private activeProcesses = new Map<string, ReturnType<typeof spawn>>()

  // ── Binary detection ───────────────────────────────────────────────────────

  private async resolveBinaryPath(): Promise<string | null> {
    if (this.cachedBinaryPath) return this.cachedBinaryPath

    // Primary: confirmed install location on Windows
    const primary = join(homedir(), ".local", "bin", "claude.exe")
    if (existsSync(primary)) {
      this.cachedBinaryPath = primary
      return primary
    }

    // Fallback: PATH lookup via where.exe
    try {
      const found = await new Promise<string | null>((resolve) => {
        execFile(
          "where.exe",
          ["claude"],
          { windowsHide: true, timeout: 5_000 },
          (err, stdout) => {
            if (err || !stdout.trim()) return resolve(null)
            const line = stdout.trim().split("\n")[0].trim()
            resolve(line || null)
          }
        )
      })
      if (found && existsSync(found)) {
        this.cachedBinaryPath = found
        return found
      }
    } catch {
      /* not found in PATH */
    }

    return null
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async available(): Promise<AvailabilityResult> {
    const binPath = await this.resolveBinaryPath()
    if (!binPath)
      return {
        available: false,
        error: "claude not found at ~/.local/bin/claude.exe or PATH",
      }

    try {
      const version = await new Promise<string>((resolve, reject) => {
        execFile(
          binPath,
          ["--version"],
          { timeout: 5_000, windowsHide: true },
          (err, stdout) => {
            if (err) return reject(err)
            resolve(stdout.trim())
          }
        )
      })
      return { available: true, version }
    } catch (err) {
      return { available: false, error: String(err) }
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    return this._run(options, null)
  }

  async stream(
    options: GenerateOptions,
    callbacks: StreamCallbacks
  ): Promise<GenerateResult> {
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

  private async _run(
    options: GenerateOptions,
    callbacks: StreamCallbacks | null
  ): Promise<GenerateResult> {
    const startedAt = Date.now()
    const requestId = options.requestId ?? randomUUID()
    const timeoutMs = options.timeoutMs ?? 60_000

    const binPath = await this.resolveBinaryPath()
    if (!binPath) {
      return {
        ok: false,
        error: "Claude Code is not installed or not found",
        code: "not-installed",
      }
    }

    return new Promise<GenerateResult>((resolve) => {
      const proc = spawn(binPath, buildArgs(options), {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: { ...process.env },
        cwd: scratchDir(),
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
        finish({
          ok: false,
          error: `Timed out after ${timeoutMs}ms`,
          code: "timeout",
        })
      }, timeoutMs)

      // ── stdout: parse NDJSON lines ──
      let stdoutBuf = ""
      // Text is accumulated ACROSS assistant messages: a run that emits prose,
      // calls a tool, then emits the answer produces two assistant messages, and
      // keeping only the last one loses content. `emittedLen` is tracked per
      // message so the streaming deltas stay correct either way.
      const textParts: string[] = []
      let emittedLen = 0
      let currentIdx = -1
      let structured: unknown
      let rateLimited = false

      proc.stdout.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString("utf8")
        const lines = stdoutBuf.split("\n")
        stdoutBuf = lines.pop() ?? "" // keep the incomplete trailing fragment

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          let msg: StreamMessage
          try {
            msg = JSON.parse(trimmed)
          } catch {
            continue
          }

          // Text chunks from assistant messages — compute delta to emit true increments
          if (msg.type === "assistant") {
            const am = msg as AssistantMessage

            if (callbacks?.onToolUse) {
              for (const block of am.message.content) {
                if (
                  block.type === "tool_use" &&
                  typeof block.name === "string"
                ) {
                  callbacks.onToolUse(block.name)
                }
              }
            }

            const fullText = am.message.content
              .filter(
                (b): b is { type: "text"; text: string } => b.type === "text"
              )
              .map((b) => b.text)
              .join("")
            if (!fullText) continue

            // A shorter text than last seen means a NEW assistant message, not a
            // rewind — start a fresh part and reset the delta cursor.
            if (currentIdx < 0 || fullText.length < emittedLen) {
              textParts.push("")
              currentIdx = textParts.length - 1
              emittedLen = 0
            }
            if (fullText.length > emittedLen) {
              callbacks?.onChunk(fullText.slice(emittedLen))
              emittedLen = fullText.length
            }
            textParts[currentIdx] = fullText
          }

          if (msg.type === "rate_limit_event") rateLimited = true

          if (msg.type === "result") {
            const rm = msg as ResultMessage
            const durationMs = Date.now() - startedAt
            if (rm.structured_output !== undefined)
              structured = rm.structured_output

            if (rm.subtype === "success" && !rm.is_error) {
              const text = rm.result?.trim() || textParts.join("\n").trim()
              if (!text && structured === undefined) {
                finish({
                  ok: false,
                  error: "Claude returned an empty response",
                  code: "empty-response",
                })
              } else {
                finish({ ok: true, text, durationMs, structured })
              }
            } else if (structured !== undefined || textParts.length > 0) {
              // Turn and execution limits still leave usable output behind — salvage
              // it rather than throwing the whole run away.
              finish({
                ok: true,
                text: rm.result?.trim() || textParts.join("\n").trim(),
                durationMs,
                structured,
              })
            } else {
              const errText = rm.error ?? `Generation failed (${rm.subtype})`
              finish({
                ok: false,
                error: errText,
                code: rateLimited ? "rate-limited" : "unknown",
              })
            }
          }
        }
      })

      // ── stderr: collect for exit-code diagnosis only ──
      const stderrChunks: string[] = []
      proc.stderr.on("data", (chunk: Buffer) =>
        stderrChunks.push(chunk.toString("utf8"))
      )

      // ── Process error (e.g. ENOENT if binary disappeared) ──
      proc.on("error", (err) => {
        finish({ ok: false, error: err.message, code: "unknown" })
      })

      // ── Process exit ──
      proc.on("close", (exitCode) => {
        if (settled) return

        const stderr = stderrChunks.join("")

        if (exitCode === 0) {
          // Exited cleanly but result message never arrived (shouldn't happen, safety net)
          const text = textParts.join("\n").trim()
          const durationMs = Date.now() - startedAt
          if (text) {
            finish({ ok: true, text, durationMs, structured })
          } else {
            finish({
              ok: false,
              error: "No output received",
              code: "empty-response",
            })
          }
          return
        }

        const code = classifyStderr(stderr, rateLimited)
        const errMsg =
          code === "not-authenticated"
            ? "Not authenticated. Run `claude login` in a terminal and restart the app."
            : code === "rate-limited"
              ? "Usage limit reached for this period."
              : stderr.trim() || `Process exited with code ${exitCode}`

        finish({ ok: false, error: errMsg.slice(0, 400), code })
      })

      // ── Write prompt to stdin then close so claude knows input is done ──
      proc.stdin.write(options.prompt, "utf8")
      proc.stdin.end()
    })
  }
}

export const claude = new ClaudeService()
