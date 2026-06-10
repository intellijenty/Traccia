import { useState, useEffect, useCallback, useRef, useReducer } from 'react'
import { relativeTime } from '@/lib/utils'

const THROTTLE_MS = 30_000

export type ClaudeUsageWindow = {
  utilization: number  // 0–100
  resetsAt: string     // ISO 8601
}

export type ClaudeUsageData = {
  session: ClaudeUsageWindow
  weekly: ClaudeUsageWindow
  fetchedAt: number
}

export function useClaudeUsage() {
  const [data, setData] = useState<ClaudeUsageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const lastFetchRef = useRef(0)
  const mountedRef = useRef(true)
  const [, forceUpdate] = useReducer(n => n + 1, 0)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchUsage = useCallback(async (force = false) => {
    if (!window.electronAPI?.getClaudeUsage) {
      setLoading(false)
      return
    }
    const now = Date.now()
    if (!force && now - lastFetchRef.current < THROTTLE_MS) return
    lastFetchRef.current = now  // stamp before await — blocks concurrent callers immediately
    setLoading(true)
    try {
      const result = await window.electronAPI.getClaudeUsage()
      if (!mountedRef.current) return
      if (result.ok) {
        setData(result.data)
        setError(null)
      } else {
        lastFetchRef.current = 0  // reset on error — allows retry next focus
        setData(null)
        setError(result.error)
      }
    } catch (e) {
      if (!mountedRef.current) return
      lastFetchRef.current = 0  // reset on error — allows retry next focus
      setData(null)
      setError(String(e))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsage(true) }, [fetchUsage])

  useEffect(() => {
    const handleFocus = () => fetchUsage()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchUsage])

  // Tick every minute to recompute countdown strings without re-fetching
  useEffect(() => {
    const id = setInterval(forceUpdate, 60_000)
    return () => clearInterval(id)
  }, [forceUpdate])

  return { data, error, loading, refresh: () => fetchUsage(true) }
}

// ── Time formatting helpers ────────────────────────────────────────────────────

export function formatCountdown(resetsAt: string): string {
  if (!resetsAt) return ''
  const target = new Date(resetsAt).getTime()
  const diff = Math.max(0, target - Date.now())
  const totalMins = Math.floor(diff / 60_000)
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60

  if (hours >= 24) return `${Math.floor(hours / 24)}d`
  if (hours >= 1) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  if (totalMins > 0) return `${totalMins}m`
  return 'now'
}

export function formatResetDay(resetsAt: string): string {
  if (!resetsAt) return ''
  const d = new Date(resetsAt)
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

export function formatRelativeTime(fetchedAt: number): string {
  return relativeTime(new Date(fetchedAt))
}
