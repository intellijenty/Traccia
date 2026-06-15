import { LicenseEngine } from "./license-engine"

// Create a GitHub Gist with this content and paste the raw URL here:
// { "alpha_users": ["UUID-1", "UUID-2"] }
const ALPHA_LIST_URL = "https://gist.githubusercontent.com/intellijenty/f6fd6db50d8e5dc14e3528cbf7e14f27/raw/traccia-alpha.json"

let _isAlpha = false

export async function initAlphaService(): Promise<void> {
    if (!ALPHA_LIST_URL) return
    try {
        const hwid = new LicenseEngine().getHardwareId()
        const res = await fetch(ALPHA_LIST_URL, { signal: AbortSignal.timeout(5000) })
        if (!res.ok) return
        const data = (await res.json()) as { alpha_users?: string[] }
        _isAlpha = Array.isArray(data.alpha_users) && data.alpha_users.includes(hwid)
    } catch {
        _isAlpha = false
    }
}

export function isAlphaUser(): boolean {
    return _isAlpha
}
