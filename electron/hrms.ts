import { net, safeStorage } from "electron"
import { getSetting, setSetting } from "./database"

let token: string | null = null
let userId: number | null = null
let userName: string | null = null

// Exported accessors — allow other modules (e.g. leave-api) to share auth state
export function getToken(): string | null { return token }
export function setToken(t: string | null): void { token = t }
export function getUserId(): number | null { return userId }

type HrmsEnvelope<T> = {
  code?: number
  token?: string
  message?: string
  data?: T
}

export interface HrmsWorkingHoursEntry {
  empid: number
  logdate: string
  intime: string
  outtime: string | null
  workingmins: number | null
  ismanual: number
}

function getBaseUrl(): string {
  return getSetting("hrmsBaseUrl") || "https://roimaint.in:7000/api"
}

function getStoredCredentials(): { email: string; password: string } | null {
  const email = getSetting("hrmsEmail")
  const encPassword = getSetting("hrmsPassword")
  if (!email || !encPassword) return null

  try {
    if (safeStorage.isEncryptionAvailable()) {
      const password = safeStorage.decryptString(
        Buffer.from(encPassword, "base64")
      )
      return { email, password }
    }
    return { email, password: encPassword }
  } catch {
    return null
  }
}

function storeCredentials(email: string, password: string): void {
  setSetting("hrmsEmail", email)
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(password)
    setSetting("hrmsPassword", encrypted.toString("base64"))
  } else {
    setSetting("hrmsPassword", password)
  }
}

export function clearCredentials(): void {
  setSetting("hrmsEmail", "")
  setSetting("hrmsPassword", "")
  setSetting("hrmsUserName", "")
  token = null
  userId = null
  userName = null
}

export function getHrmsConnectionStatus(): {
  connected: boolean
  userName: string | null
  userId: number | null
  hasCredentials: boolean
} {
  const creds = getStoredCredentials()
  return {
    connected: token !== null,
    // Fall back to DB-persisted name so it survives restarts
    // (module variable is null until first login/auto-login this session)
    userName: userName || getSetting("hrmsUserName") || null,
    userId,
    hasCredentials: creds !== null,
  }
}

export async function hrmsLogin(
  email?: string,
  password?: string
): Promise<{
  success: boolean
  message?: string
  userName?: string
  userId?: number
}> {
  const creds =
    email && password ? { email, password } : getStoredCredentials()
  if (!creds) return { success: false, message: "No credentials configured" }

  const baseUrl = getBaseUrl()

  try {
    const response = await net.fetch(`${baseUrl}/Auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    })

    if (!response.ok) {
      return {
        success: false,
        message: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    const result = (await response.json()) as HrmsEnvelope<{
      user_id: number
      name: string
    }>

    if (result.code === 1 && result.token && result.data) {
      token = result.token
      userId = result.data.user_id
      userName = result.data.name

      // Persist name so getHrmsConnectionStatus returns it immediately on restart
      setSetting("hrmsUserName", result.data.name)

      // Store credentials on explicit login
      if (email && password) {
        storeCredentials(email, password)
      }

      return {
        success: true,
        userName: result.data.name,
        userId: result.data.user_id,
      }
    }

    return {
      success: false,
      message: result.message || "Authentication failed",
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection failed"
    return { success: false, message }
  }
}

export async function hrmsGetWorkingHours(
  date?: string,
  _retried = false
): Promise<{
  success: boolean
  entries: Array<{
    empid: number
    logdate: string
    intime: string
    outtime: string | null
    workingmins: number | null
    ismanual: number
  }>
  totalMinutes: number
  isCurrentlyIn: boolean
  lastInTime: string | null
  activeSessionMinutes: number
  message?: string
}> {
  const empty = {
    success: false as const,
    entries: [] as Array<{
      empid: number
      logdate: string
      intime: string
      outtime: string | null
      workingmins: number | null
      ismanual: number
    }>,
    totalMinutes: 0,
    isCurrentlyIn: false,
    lastInTime: null,
    activeSessionMinutes: 0,
  }

  // Auto-login if no token
  if (!token || !userId) {
    const loginResult = await hrmsLogin()
    if (!loginResult.success) {
      return { ...empty, message: loginResult.message }
    }
  }

  const baseUrl = getBaseUrl()
  const logdate =
    date || new Date().toISOString().replace(/T.*/, "T00:00:00.000Z")

  try {
    const url = `${baseUrl}/EmployeeWorkingHours/?empid=${userId}&logdate=${logdate}`
    const response = await net.fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })

    console.log(`GET ${url} - RESPONSE: ${response.status}`)

    // Token expired — re-auth once
    if (response.status === 401 && !_retried) {
      token = null
      const loginResult = await hrmsLogin()
      if (!loginResult.success) {
        return {
          ...empty,
          message: "Session expired. " + (loginResult.message || ""),
        }
      }
      return hrmsGetWorkingHours(date, true)
    }

    if (!response.ok) {
      return { ...empty, message: `HTTP ${response.status}` }
    }

    const result = (await response.json()) as HrmsEnvelope<
      HrmsWorkingHoursEntry[]
    >

    // Refresh token from response
    if (result.token) {
      token = result.token
    }

    if (result.code === 0) {
      return { ...empty, message: result.message || "Access denied" }
    }

    const entries = result.data || []

    let totalMinutes = 0
    let isCurrentlyIn = false
    let lastInTime: string | null = null
    let activeSessionMinutes = 0

    for (const entry of entries) {
      if (entry.workingmins != null) {
        totalMinutes += entry.workingmins
      }
      if (entry.outtime === null) {
        isCurrentlyIn = true
        lastInTime = entry.intime
        activeSessionMinutes = Math.floor(
          (Date.now() - new Date(entry.intime).getTime()) / 60000
        )
        totalMinutes += activeSessionMinutes
      }
    }

    return {
      success: true,
      entries,
      totalMinutes,
      isCurrentlyIn,
      lastInTime,
      activeSessionMinutes,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection failed"
    return { ...empty, message }
  }
}

export interface WeekDayPortalSummary {
  date: string
  totalMinutes: number
  missPunchCount: number
  sessionCount: number
}

export async function hrmsGetWeekHours(
  dates: string[]
): Promise<WeekDayPortalSummary[]> {
  const today = new Date().toLocaleDateString("en-CA")

  console.log(`----------------------------------------------------------------------`)
  console.log(`[portal] Fetching working hours for week: ${dates.join(", ")}`)

  const results = await Promise.all(
    dates.map(async (date) => {
      const apiDate = `${date}T00:00:00.000Z`
      const result = await hrmsGetWorkingHours(apiDate)

      if (!result.success) {
        return { date, totalMinutes: 0, missPunchCount: 0, sessionCount: 0 }
      }

      let totalMinutes = 0
      let missPunchCount = 0

      for (const entry of result.entries) {
        if (entry.outtime === null && date !== today) {
          // Past date with null outtime = miss punch — exclude
          missPunchCount++
          continue
        }
        if (entry.workingmins != null) {
          totalMinutes += entry.workingmins
        }
        if (entry.outtime === null && date === today) {
          // Currently checked in — add live minutes
          const active = Math.floor(
            (Date.now() - new Date(entry.intime).getTime()) / 60000
          )
          totalMinutes += active
        }
      }

      return {
        date,
        totalMinutes,
        missPunchCount,
        sessionCount: result.entries.length,
      }
    })
  )

  console.log(`----------------------------------------------------------------------`)

  return results
}
