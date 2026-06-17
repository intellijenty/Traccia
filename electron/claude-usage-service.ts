import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClaudeUsageWindow = {
  utilization: number  // 0–100
  resetsAt: string     // ISO 8601
}

export type ClaudeUsageData = {
  session: ClaudeUsageWindow
  weekly: ClaudeUsageWindow
  fetchedAt: number
}

export type ClaudeUsageResult =
  | { ok: true; data: ClaudeUsageData }
  | { ok: false; error: string }

// ── Service ───────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000

class ClaudeUsageService {
  private credentialsPath = join(homedir(), '.claude', '.credentials.json')
  private pending: Promise<ClaudeUsageResult> | null = null
  private cache: ClaudeUsageResult | null = null
  private cachedAt = 0

  private readToken(): string | null {
    try {
      if (!existsSync(this.credentialsPath)) return null
      const raw = readFileSync(this.credentialsPath, 'utf8')
      const parsed = JSON.parse(raw)
      return parsed?.claudeAiOauth?.accessToken ?? null
    } catch {
      return null
    }
  }

  // Returns cached result within TTL, coalesces concurrent in-flight callers.
  fetch(): Promise<ClaudeUsageResult> {
if (this.cache && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return Promise.resolve(this.cache)
    }
    if (this.pending) return this.pending
    this.pending = this._doFetch()
      .then(result => {
        if (result.ok) { this.cache = result; this.cachedAt = Date.now() }
        return result
      })
      .finally(() => { this.pending = null })
    return this.pending
  }

  private async _doFetch(): Promise<ClaudeUsageResult> {
    const token = this.readToken()
    if (!token) return { ok: false, error: 'Claude Code not logged in — run `claude login`' }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)

    try {
      const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'anthropic-beta': 'oauth-2025-04-20',
        },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: 'Not authenticated — run `claude login`' }
      }
      if (!res.ok) {
        return { ok: false, error: `API returned ${res.status}` }
      }

      const json = await res.json() as Record<string, unknown>
      const fiveHour = json.five_hour as { utilization?: number; resets_at?: string } | undefined
      const sevenDay = json.seven_day as { utilization?: number; resets_at?: string } | undefined
      if (!fiveHour || !sevenDay) {
        return { ok: false, error: 'Unexpected API response shape' }
      }

      return {
        ok: true,
        data: {
          session: { utilization: fiveHour.utilization ?? 0, resetsAt: fiveHour.resets_at ?? '' },
          weekly: { utilization: sevenDay.utilization ?? 0, resetsAt: sevenDay.resets_at ?? '' },
          fetchedAt: Date.now(),
        },
      }
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        return { ok: false, error: 'Request timed out' }
      }
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}

export const claudeUsage = new ClaudeUsageService()
