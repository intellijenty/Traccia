// Ticket-key extraction, shared by every stage that needs to know which keys are
// backed by real evidence.
//
// Two jobs that used to live in separate places and disagreed with each other:
// finding keys the user declared in prose, and finding keys that literally
// appear in the evidence we collected ourselves (session digests, git). The
// second one is what lets us verify the AI's fact sheet instead of taking it on
// trust.

import type { SessionDigest } from "./eod-session-digest"
import type { RepoEvidence } from "./eod-git-evidence"

/**
 * Jira-style key. Case-insensitive because branch names are usually lowercase
 * (`feature/aton-3928`) and people type `aton-5555` in notes; every result is
 * upper-cased. The prefix must contain at least two letters, which rules out
 * path fragments like `v2-1` and `x-3`.
 */
const KEY_RX = /\b([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,6})\b/g

function hasTwoLetters(prefix: string): boolean {
  let letters = 0
  for (const ch of prefix) if (/[A-Za-z]/.test(ch)) letters++
  return letters >= 2
}

/**
 * Technical standards and units that match the key shape. Without this,
 * "UTF-8", "SHA-256" or "COVID-19" anywhere in a note permanently whitelists a
 * fake ticket key, defeating the anti-hallucination check. A prefix the user
 * demonstrably uses as a real project code (see learnProjectPrefixes) overrides
 * this list.
 */
const NON_PROJECT_PREFIXES = new Set([
  "UTF",
  "ISO",
  "RFC",
  "SHA",
  "MD",
  "AES",
  "RSA",
  "DES",
  "GPT",
  "COVID",
  "CVE",
  "ANSI",
  "ASCII",
  "IEEE",
  "ISBN",
  "PEP",
  "ECMA",
  "WCAG",
  "TLS",
  "SSL",
  "UTC",
  "GMT",
  "HTTP",
  "HTTPS",
  "ES",
  "IPV",
  "BASE",
  "MP",
  "EC",
  "WIN",
  "PS",
  "NET",
])

/** Every ticket-shaped key in `text`, upper-cased and de-duplicated. */
export function extractTicketKeys(
  text: string,
  knownPrefixes?: ReadonlySet<string>
): string[] {
  if (typeof text !== "string" || !text) return []
  const keys = new Set<string>()
  for (const match of text.matchAll(KEY_RX)) {
    const prefix = match[1].toUpperCase()
    if (!hasTwoLetters(prefix)) continue
    if (NON_PROJECT_PREFIXES.has(prefix) && !knownPrefixes?.has(prefix))
      continue
    keys.add(`${prefix}-${match[2]}`)
  }
  return Array.from(keys)
}

/**
 * Project codes the user demonstrably uses, learned from high-precision sources
 * only: keys written as "KEY - title" in past EODs, and keys the user typed
 * themselves. A prefix learned here is exempt from NON_PROJECT_PREFIXES, so a
 * team whose project code genuinely collides with a standard still works.
 */
export function learnProjectPrefixes(keys: Iterable<string>): Set<string> {
  const prefixes = new Set<string>()
  for (const key of keys) {
    const dash = key.indexOf("-")
    if (dash > 0) prefixes.add(key.slice(0, dash).toUpperCase())
  }
  return prefixes
}

/**
 * Ticket keys mentioned anywhere in user-authored text (standing instructions,
 * per-run notes, a refine instruction). A user declaration counts as evidence:
 * these can never be dropped by verification.
 */
export function extractDeclaredKeys(
  text: string,
  knownPrefixes?: ReadonlySet<string>
): string[] {
  return extractTicketKeys(text, knownPrefixes)
}

/**
 * Keys that literally appear in the evidence Traccia gathered itself. This is
 * the ground truth the AI's fact sheet gets screened against - a key the model
 * reports that appears nowhere here (and did not come from a live Jira query)
 * can only have come from the past-EOD title index, i.e. it is stale history.
 */
export function collectEvidenceKeys(
  digests: SessionDigest[],
  git: RepoEvidence[],
  knownPrefixes?: ReadonlySet<string>
): Set<string> {
  const parts: string[] = []
  for (const d of digests) {
    parts.push(d.cwd, d.gitBranch ?? "")
    parts.push(...d.userPrompts, ...d.assistantSummaries, ...d.delegations)
    parts.push(...d.filesChanged, ...d.commands)
  }
  for (const r of git) {
    parts.push(r.repoPath, r.branch, r.uncommitted ?? "")
    parts.push(...r.commitsToday)
  }
  const keys = new Set<string>()
  for (const key of extractTicketKeys(parts.join("\n"), knownPrefixes))
    keys.add(key)
  return keys
}
