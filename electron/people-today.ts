import { net } from "electron"
import { hrmsLogin, getToken, setToken } from "./hrms"
import { getSetting, setSetting } from "./database"

const SNAPSHOT_KEY = "todayPeopleSnapshot"

export interface LeavePerson {
  userId: number
  name: string
  leaveName: string
  startDate: string
  endDate: string | null
  startType: number
  endType: number
}

export interface BirthdayPerson {
  userId: number
  name: string
}

export interface PeopleList<T> {
  date: string
  fetchedAt: string
  people: T[]
}

export interface PeopleTodaySnapshot {
  onLeave: PeopleList<LeavePerson> | null
  birthdays: PeopleList<BirthdayPerson> | null
}

export interface PeopleTodayRefreshResult {
  snapshot: PeopleTodaySnapshot
  failed: ("onLeave" | "birthdays")[]
}

interface PeopleOnLeaveRaw {
  user_id: number
  name: string | null
  leaveName: string | null
  start_date: string
  end_date: string | null
  start_type: number
  end_type: number
}

interface BirthdayRaw {
  user_id: number
  name: string | null
}

type FetchResult<T> = { ok: true; data: T } | { ok: false; message: string }

function getBaseUrl(): string {
  return getSetting("hrmsBaseUrl") || "https://roimaint.in:7000/api"
}

function getLocalDate(): string {
  return new Date().toLocaleDateString("en-CA")
}

function datePart(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null
}

async function hrmsGetList<T>(
  path: string,
  retried = false
): Promise<FetchResult<T[]>> {
  if (!getToken()) {
    const login = await hrmsLogin()
    if (!login.success)
      return { ok: false, message: login.message ?? "Login failed" }
  }

  const url = `${getBaseUrl()}/${path}`
  try {
    const response = await net.fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    console.log(`GET ${url} - RESPONSE: ${response.status}`)

    if (response.status === 401 && !retried) {
      setToken(null)
      return hrmsGetList<T>(path, true)
    }
    if (!response.ok) return { ok: false, message: `HTTP ${response.status}` }

    const result = (await response.json()) as {
      code?: number
      token?: string
      message?: string
      data?: T[]
    }
    if (result.token) setToken(result.token)
    if (result.code === 0) {
      return { ok: false, message: result.message || "Access denied" }
    }
    return { ok: true, data: result.data ?? [] }
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Connection failed",
    }
  }
}

export function getPeopleTodaySnapshot(): PeopleTodaySnapshot {
  const raw = getSetting(SNAPSHOT_KEY)
  if (!raw) return { onLeave: null, birthdays: null }
  try {
    const parsed = JSON.parse(raw) as Partial<PeopleTodaySnapshot>
    return {
      onLeave: parsed.onLeave ?? null,
      birthdays: parsed.birthdays ?? null,
    }
  } catch {
    return { onLeave: null, birthdays: null }
  }
}

export async function refreshPeopleToday(): Promise<PeopleTodayRefreshResult> {
  const [leaveResult, birthdayResult] = await Promise.all([
    hrmsGetList<PeopleOnLeaveRaw>("LeaveApplication/PeopleOnLeave"),
    hrmsGetList<BirthdayRaw>("User/birthdaypeople"),
  ])

  const snapshot = getPeopleTodaySnapshot()
  const date = getLocalDate()
  const fetchedAt = new Date().toISOString()
  const failed: PeopleTodayRefreshResult["failed"] = []

  if (leaveResult.ok) {
    snapshot.onLeave = {
      date,
      fetchedAt,
      people: leaveResult.data.map((row) => ({
        userId: row.user_id,
        name: row.name?.trim() || "Unknown",
        leaveName: row.leaveName?.trim() || "Leave",
        startDate: datePart(row.start_date) ?? date,
        endDate: datePart(row.end_date),
        startType: row.start_type,
        endType: row.end_type,
      })),
    }
  } else {
    console.error("[people-today] On leave fetch failed:", leaveResult.message)
    failed.push("onLeave")
  }

  if (birthdayResult.ok) {
    snapshot.birthdays = {
      date,
      fetchedAt,
      people: birthdayResult.data.map((row) => ({
        userId: row.user_id,
        name: row.name?.trim() || "Unknown",
      })),
    }
  } else {
    console.error(
      "[people-today] Birthdays fetch failed:",
      birthdayResult.message
    )
    failed.push("birthdays")
  }

  setSetting(SNAPSHOT_KEY, JSON.stringify(snapshot))
  return { snapshot, failed }
}
