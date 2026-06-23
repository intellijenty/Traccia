// Deterministic git evidence gatherer.
//
// For each candidate repo (cwd values from today's Claude sessions plus the
// persisted known-repos list) collect: current branch (ticket keys live in
// branch names), today's commits by the repo's own configured author, and a
// short summary of uncommitted work. Catches manual work that never went
// through a Claude session.

import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export interface RepoEvidence {
  repoPath: string
  branch: string
  commitsToday: string[]
  /** e.g. "unstaged: 3 files changed, 40 insertions(+) | staged: 1 file changed" */
  uncommitted: string | null
}

const GIT_TIMEOUT_MS = 5_000
const MAX_COMMITS_PER_REPO = 50
const MAX_REPOS = 15

function git(repoPath: string, args: string[]): Promise<string | null> {
  return new Promise(resolve => {
    execFile(
      'git',
      args,
      { cwd: repoPath, timeout: GIT_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => resolve(err ? null : stdout.trim()),
    )
  })
}

function isGitRepo(repoPath: string): boolean {
  try {
    // .git is a directory in normal clones, a file in worktrees — both count
    return existsSync(join(repoPath, '.git'))
  } catch {
    return false
  }
}

async function gatherRepo(repoPath: string, sinceIso: string): Promise<RepoEvidence | null> {
  const branch = await git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === null) return null // not a usable repo

  const email = await git(repoPath, ['config', 'user.email'])

  const logArgs = [
    'log', '--all', `--since=${sinceIso}`,
    `-n${MAX_COMMITS_PER_REPO}`,
    '--date=format:%H:%M', '--pretty=format:%h [%ad] %s',
  ]
  if (email) logArgs.push(`--author=${email}`)
  const log = await git(repoPath, logArgs)
  const commitsToday = log ? log.split('\n').filter(Boolean) : []

  const unstaged = await git(repoPath, ['diff', '--shortstat'])
  const staged = await git(repoPath, ['diff', '--cached', '--shortstat'])
  const parts: string[] = []
  if (unstaged) parts.push(`unstaged: ${unstaged}`)
  if (staged) parts.push(`staged: ${staged}`)

  return {
    repoPath,
    branch,
    commitsToday,
    uncommitted: parts.length > 0 ? parts.join(' | ') : null,
  }
}

/**
 * Gather evidence from all repos in parallel. Repos that error or aren't git
 * repos are silently skipped. Only repos with actual signal today (commits,
 * uncommitted changes, or a ticket-looking branch) are returned.
 */
export async function gatherGitEvidence(repoPaths: string[], sinceIso: string): Promise<RepoEvidence[]> {
  const unique = Array.from(new Set(repoPaths.filter(p => p && isGitRepo(p)))).slice(0, MAX_REPOS)
  const settled = await Promise.all(unique.map(p => gatherRepo(p, sinceIso).catch(() => null)))
  return settled.filter((r): r is RepoEvidence => {
    if (!r) return false
    return r.commitsToday.length > 0 || r.uncommitted !== null
  })
}
