/**
 * leave-api.ts — decoupled API adapter for leave applications.
 *
 * Reusable by any feature that needs to fetch leave data from the portal.
 * Auth state is shared with hrms.ts via the exported getToken / setToken /
 * getUserId accessors so there is no duplicate login flow.
 */

import { net } from "electron"
import { hrmsLogin, getToken, setToken, getUserId } from "./hrms"
import { getSetting } from "./database"

function getBaseUrl(): string {
  return getSetting("hrmsBaseUrl") || "https://roimaint.in:7000/api"
}

// ── Raw API shape ─────────────────────────────────────────────────────────────

export interface LeaveApplicationRaw {
  app_id: number
  user_id: number
  user_type_id: number
  leave_type_id: number
  leave_name: string
  start_date: string       // ISO datetime, e.g. "2026-04-10T00:00:00"
  start_type: number       // 1=Full Day, 2=First Half, 3=Second Half
  end_date: string         // ISO datetime
  end_type: number         // 1=Full Day, 2=First Half
  total_days: number
  comment: string
  status: number
  created_at: string
  created_by: number
  modified_at: string | null
  modified_by: number
  is_approved_by_pm: boolean
  available_days: number | null
}

// ── Fetch options & result ────────────────────────────────────────────────────

export interface FetchLeavesOptions {
  leaveTypeId?: number  // 1=Casual, 2=Earned, 3=Public Holiday, 4=Comp-off
  status?: number       // filter to a specific status code
}

export interface FetchLeavesResult {
  success: boolean
  data: LeaveApplicationRaw[]
  message?: string
}

// ── Status code constants (for callers) ──────────────────────────────────────

export const LEAVE_STATUS = {
  NEW: 1,
  MODIFIED: 2,
  APPROVED_BY_SUPERVISOR: 3,
  REJECTED_BY_SUPERVISOR: 4,
  APPROVED_BY_HR: 5,
  REJECTED_BY_HR: 6,
  CANCELLED_BY_SELF: 7,
  CANCELLATION_REQUESTED: 8,
  CANCELLATION_APPROVED_BY_SUPERVISOR: 9,
  CANCELLATION_REJECTED_BY_SUPERVISOR: 10,
  CANCELLATION_APPROVED_BY_HR: 11,
  CANCELLATION_REJECTED_BY_HR: 12,
} as const

export const LEAVE_TYPE = {
  CASUAL: 1,
  EARNED: 2,
  PUBLIC_HOLIDAY: 3,
  COMP_OFF: 4,
} as const

// ── Main fetch function ───────────────────────────────────────────────────────

export async function fetchLeaveApplications(
  options: FetchLeavesOptions = {},
  _retried = false
): Promise<FetchLeavesResult> {
  const empty: FetchLeavesResult = { success: false, data: [] }

  // Ensure authenticated
  if (!getToken() || !getUserId()) {
    const loginResult = await hrmsLogin()
    if (!loginResult.success) {
      return { ...empty, message: loginResult.message }
    }
  }

  const baseUrl = getBaseUrl()
  const params = new URLSearchParams({ user_Id: String(getUserId()) })
  if (options.leaveTypeId !== undefined) params.set("leave_type_id", String(options.leaveTypeId))
  if (options.status !== undefined) params.set("status", String(options.status))

  const url = `${baseUrl}/LeaveApplication?${params}`

  try {
    const response = await net.fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${getToken()}` },
    })

    console.log(`GET ${url} - RESPONSE: ${response.status}`)

    // Token expired — re-auth once then retry
    if (response.status === 401 && !_retried) {
      setToken(null)
      const loginResult = await hrmsLogin()
      if (!loginResult.success) {
        return { ...empty, message: "Session expired. " + (loginResult.message || "") }
      }
      return fetchLeaveApplications(options, true)
    }

    if (!response.ok) {
      return { ...empty, message: `HTTP ${response.status}` }
    }

    const result = (await response.json()) as {
      code?: number
      token?: string
      message?: string
      data?: LeaveApplicationRaw[]
    }

    // Rotate token if server sends a fresh one
    if (result.token) setToken(result.token)

    if (result.code === 0) {
      return { ...empty, message: result.message || "Access denied" }
    }

    return { success: true, data: result.data ?? [] }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection failed"
    return { ...empty, message }
  }
}
