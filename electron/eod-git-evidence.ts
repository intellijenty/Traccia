// Deterministic git evidence gatherer.
//
// For each candidate repo (cwd values from today's Claude sessions plus the
// persisted known-repos list) collect: current branch (ticket keys live in
// branch names), today's commits by the repo's own configured author, and the
// files changed today that are not yet committed. Catches manual work that
// never went through a Claude session.
//
// Everything reported here is DATED against the effective work-day start. An
// undated signal (e.g. a plain `git diff --shortstat`, which happily reports a
// working tree you dirtied three weeks ago) resurfaces in every EOD forever,
// and - because a repo with such a signal counts as "active today" - also keeps
// re-persisting itself into the known-repos list.

import { execFile } from "child_process"
import { existsSync, promises as fs } from "fs"
import { isAbsolute, join } from "path"

export interface RepoEvidence {
  repoPath: string
  branch: string
  commitsToday: string[]
  /** e.g. "4 files changed today: src/a.ts, src/b.ts" */
  uncommitted: string | null
}

const GIT_TIMEOUT_MS = 5_000
const MAX_COMMITS_PER_REPO = 50
const MAX_REPOS = 15
const MAX_LISTED_DIRTY_FILES = 10
/** ASCII unit separator - cannot occur in a commit subject. */
const FIELD_SEP = "\x1f"

function git(repoPath: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd: repoPath,
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
      (err, stdout) => resolve(err ? null : stdout.trim())
    )
  })
}

function isGitRepo(repoPath: string): boolean {
  try {
    // .git is a directory in normal clones, a file in worktrees - both count
    return existsSync(join(repoPath, ".git"))
  } catch {
    return false
  }
}

/**
 * Paths with unstaged or staged changes. Renames report their destination.
 * Untracked files are excluded - build output and scratch files would drown
 * out real work.
 */
export function parsePorcelain(porcelain: string): string[] {
  const paths: string[] = []
  for (const line of porcelain.split("\n")) {
    if (line.length < 4) continue
    let rest = line.slice(3)
    const arrow = rest.indexOf(" -> ")
    if (arrow >= 0) rest = rest.slice(arrow + 4) // rename: keep the destination
    const path = rest.trim().replace(/^"|"$/g, "")
    if (path) paths.push(path)
  }
  return paths
}

/**
 * Of the dirty paths, the ones whose file was actually modified during this
 * work day. A path we cannot stat (deleted, or gone since `git status` ran) is
 * dropped rather than assumed recent.
 */
async function dirtyFilesToday(
  repoPath: string,
  paths: string[],
  sinceMs: number
): Promise<string[]> {
  const checked = await Promise.all(
    paths.slice(0, 200).map(async (rel) => {
      const full = isAbsolute(rel) ? rel : join(repoPath, rel)
      try {
        const stat = await fs.stat(full)
        return stat.mtimeMs >= sinceMs ? rel : null
      } catch {
        return null
      }
    })
  )
  return checked.filter((p): p is string => p !== null)
}

function summarizeDirty(files: string[]): string {
  const shown = files.slice(0, MAX_LISTED_DIRTY_FILES)
  const more = files.length - shown.length
  const suffix = more > 0 ? `, +${more} more` : ""
  return `${files.length} file${files.length > 1 ? "s" : ""} changed today: ${shown.join(", ")}${suffix}`
}

async function gatherRepo(
  repoPath: string,
  sinceIso: string
): Promise<RepoEvidence | null> {
  const branch = await git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"])
  if (branch === null) return null // not a usable repo

  const sinceMs = new Date(sinceIso).getTime()
  const email = await git(repoPath, ["config", "user.email"])

  // `--since` filters COMMITTER date, which a rebase, amend or cherry-pick
  // rewrites - that is how months-old commits show up as today's work. Use it
  // only as a cheap prefilter and decide on the author date below.
  // Scoped to local branches + HEAD rather than `--all`, so merely fetching a
  // remote branch does not turn its commits into evidence.
  const logArgs = [
    "log",
    "--branches",
    "HEAD",
    "--no-merges",
    `--since=${sinceIso}`,
    `-n${MAX_COMMITS_PER_REPO}`,
    "--date=format:%H:%M",
    `--pretty=format:%aI${FIELD_SEP}%h${FIELD_SEP}%ad${FIELD_SEP}%s`,
  ]
  if (email) logArgs.push(`--author=${email}`)
  const log = await git(repoPath, logArgs)

  const seen = new Set<string>()
  const commitsToday: string[] = []
  for (const line of log ? log.split("\n") : []) {
    if (!line.trim()) continue
    const [authorIso, short, time, ...subjectParts] = line.split(FIELD_SEP)
    const authoredMs = new Date(authorIso).getTime()
    if (Number.isNaN(authoredMs) || authoredMs < sinceMs) continue
    // `--branches HEAD` can list the same commit twice when HEAD is a branch tip
    if (seen.has(short)) continue
    seen.add(short)
    commitsToday.push(`${short} [${time}] ${subjectParts.join(FIELD_SEP)}`)
  }

  const porcelain = await git(repoPath, [
    "status",
    "--porcelain",
    "--untracked-files=no",
  ])
  const dirtyToday = porcelain
    ? await dirtyFilesToday(repoPath, parsePorcelain(porcelain), sinceMs)
    : []

  return {
    repoPath,
    branch,
    commitsToday,
    uncommitted: dirtyToday.length > 0 ? summarizeDirty(dirtyToday) : null,
  }
}

/**
 * Gather evidence from all repos in parallel. Repos that error or aren't git
 * repos are silently skipped. Only repos with actual signal today (commits
 * authored today, or files dirtied today) are returned.
 */
export async function gatherGitEvidence(
  repoPaths: string[],
  sinceIso: string
): Promise<RepoEvidence[]> {
  const unique = Array.from(
    new Set(repoPaths.filter((p) => p && isGitRepo(p)))
  ).slice(0, MAX_REPOS)
  const settled = await Promise.all(
    unique.map((p) => gatherRepo(p, sinceIso).catch(() => null))
  )
  return settled.filter((r): r is RepoEvidence => {
    if (!r) return false
    return r.commitsToday.length > 0 || r.uncommitted !== null
  })
}
