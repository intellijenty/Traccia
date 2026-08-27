import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gatherGitEvidence, parsePorcelain } from '../electron/eod-git-evidence'

describe('parsePorcelain', () => {
  it('reads a modified path', () => {
    expect(parsePorcelain(' M src/a.ts')).toEqual(['src/a.ts'])
  })

  it('reads staged and unstaged alike', () => {
    expect(parsePorcelain('M  staged.ts\n M unstaged.ts\nMM both.ts')).toEqual([
      'staged.ts',
      'unstaged.ts',
      'both.ts',
    ])
  })

  it('reports the destination of a rename', () => {
    expect(parsePorcelain('R  old/name.ts -> new/name.ts')).toEqual(['new/name.ts'])
  })

  it('unquotes a path with spaces', () => {
    expect(parsePorcelain(' M "src/a file.ts"')).toEqual(['src/a file.ts'])
  })

  it('ignores blank and truncated lines', () => {
    expect(parsePorcelain('\n M ok.ts\n\nxy')).toEqual(['ok.ts'])
  })

  it('returns nothing for empty output', () => {
    expect(parsePorcelain('')).toEqual([])
  })
})

// Runs against a real repository rather than a mocked git. Mocking git would
// only assert that the mock matches an assumption about git, which is the class
// of mistake these tests exist to catch.
describe('gatherGitEvidence', () => {
  let dir: string
  const DAY_START = new Date()
  DAY_START.setHours(0, 0, 0, 0)
  const LONG_AGO = new Date(DAY_START.getTime() - 30 * 24 * 3600 * 1000)

  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'], // git narrates branch switches on stderr
    })

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'traccia-git-'))
    git('init', '-b', 'main')
    git('config', 'user.email', 'dev@example.com')
    git('config', 'user.name', 'Dev')
    git('config', 'commit.gpgsign', 'false')
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const write = (name: string, body: string) => writeFileSync(join(dir, name), body)

  /** Backdate a file so it looks like it was last touched weeks ago. */
  const backdate = (name: string) => {
    const when = LONG_AGO.getTime() / 1000
    utimesSync(join(dir, name), when, when)
  }

  const evidence = async () => (await gatherGitEvidence([dir], DAY_START.toISOString()))[0]

  it('reports nothing for a repository with no activity', async () => {
    write('README.md', 'seed')
    git('add', '.')
    git('commit', '-m', 'seed', '--date', LONG_AGO.toISOString())
    // Rewrite the commit date too, so nothing about it looks like today.
    git('commit', '--amend', '--no-edit', '--date', LONG_AGO.toISOString())
    backdate('README.md')
    expect(await evidence()).toBeUndefined()
  })

  it('ignores a working tree that was dirtied weeks ago', async () => {
    // This is the bug that put month-old changes in every EOD: the old check
    // asked whether the tree was dirty, never when it was dirtied.
    write('stale.txt', 'changed long ago')
    git('add', 'stale.txt')
    backdate('stale.txt')
    expect(await evidence()).toBeUndefined()
  })

  it('reports a tracked file changed today', async () => {
    write('fresh.txt', 'changed today')
    git('add', 'fresh.txt')
    const result = await evidence()
    expect(result.uncommitted).toContain('fresh.txt')
    expect(result.uncommitted).toContain('1 file changed today')
  })

  it('does not count untracked files', async () => {
    // Build output and scratch files would otherwise drown out real work.
    write('scratch.tmp', 'junk')
    const result = await evidence()
    expect(result.uncommitted).not.toContain('scratch.tmp')
  })

  it('reports a commit made today', async () => {
    git('commit', '-m', 'ATON-100 fix the thing')
    const result = await evidence()
    expect(result.commitsToday).toHaveLength(1)
    expect(result.commitsToday[0]).toContain('ATON-100 fix the thing')
  })

  it('reports the current branch', async () => {
    const result = await evidence()
    expect(result.branch).toBe('main')
  })

  it('ignores commits by another author', async () => {
    git('-c', 'user.email=someone@else.com', '-c', 'user.name=Someone',
      'commit', '--allow-empty', '-m', 'not my work')
    const result = await evidence()
    expect(result.commitsToday.some(c => c.includes('not my work'))).toBe(false)
  })

  it('ignores work authored long ago even when it lands in the repo today', async () => {
    // A rebase or cherry-pick rewrites the committer date to now, so filtering
    // on that date resurrects months-old work as today's.
    git('commit', '--allow-empty', '-m', 'ancient work',
      '--date', LONG_AGO.toISOString())
    const result = await evidence()
    expect(result.commitsToday.some(c => c.includes('ancient work'))).toBe(false)
  })

  it('does not report a merge commit as work', async () => {
    git('checkout', '-b', 'side')
    write('side.txt', 'side work')
    git('add', 'side.txt')
    git('commit', '-m', 'side work')
    git('checkout', 'main')
    git('merge', '--no-ff', 'side', '-m', 'Merge branch side')
    const result = await evidence()
    expect(result.commitsToday.some(c => c.includes('Merge branch'))).toBe(false)
    expect(result.commitsToday.some(c => c.includes('side work'))).toBe(true)
  })

  it('lists each commit once', async () => {
    const result = await evidence()
    const shas = result.commitsToday.map(c => c.split(' ')[0])
    expect(new Set(shas).size).toBe(shas.length)
  })

  it('skips a directory that is not a repository', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'traccia-plain-'))
    try {
      expect(await gatherGitEvidence([plain], DAY_START.toISOString())).toEqual([])
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })

  it('ignores paths that do not exist', async () => {
    expect(await gatherGitEvidence(['C:/nope/does/not/exist'], DAY_START.toISOString())).toEqual([])
  })

  it('accepts an empty list', async () => {
    expect(await gatherGitEvidence([], DAY_START.toISOString())).toEqual([])
  })
})
