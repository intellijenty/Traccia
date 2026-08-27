import { describe, expect, it } from 'vitest'
import {
  collectEvidenceKeys,
  extractDeclaredKeys,
  extractTicketKeys,
  learnProjectPrefixes,
} from '../electron/eod-ai-keys'
import { digest, repo } from './helpers'

describe('extractTicketKeys', () => {
  it('finds a plain key', () => {
    expect(extractTicketKeys('ATON-7632 - fix quota')).toEqual(['ATON-7632'])
  })

  it('upper-cases keys found in lowercase, as branch names carry them', () => {
    expect(extractTicketKeys('feature/aton-3928-fix-quota')).toEqual(['ATON-3928'])
  })

  it('finds keys anywhere in a line, not only at the start', () => {
    // The old anchored check missed exactly this, which is the shape stale
    // history leaks in as.
    expect(extractTicketKeys('Continued work on ATON-9999 quota')).toEqual(['ATON-9999'])
  })

  it('finds every key on a line', () => {
    expect(extractTicketKeys('ATON-1 is blocked by TRAC-22')).toEqual(['ATON-1', 'TRAC-22'])
  })

  it('de-duplicates, normalising case first', () => {
    expect(extractTicketKeys('ATON-1 and aton-1 and Aton-1')).toEqual(['ATON-1'])
  })

  it('returns nothing for input that is not a string', () => {
    expect(extractTicketKeys(undefined as unknown as string)).toEqual([])
    expect(extractTicketKeys('')).toEqual([])
  })

  describe('rejects things shaped like keys that are not keys', () => {
    it.each([
      ['UTF-8', 'encode the file as UTF-8 please'],
      ['SHA-256', 'hashed with SHA-256'],
      ['ISO-8601', 'timestamps use ISO-8601'],
      ['COVID-19', 'the COVID-19 dashboard'],
      ['GPT-4', 'compared against GPT-4'],
      ['RFC-2119', 'per RFC-2119 wording'],
      ['CVE-2024', 'tracking CVE-2024-1234'],
      ['HTTP-2', 'switched to HTTP-2'],
    ])('%s', (_label, input) => {
      expect(extractTicketKeys(input)).toEqual([])
    })

    it('a prefix with fewer than two letters', () => {
      // Path fragments and coordinates, e.g. src/v2-1/index.ts
      expect(extractTicketKeys('src/v2-1/index.ts')).toEqual([])
      expect(extractTicketKeys('grid x-3 offset')).toEqual([])
    })

    it('a single-character prefix', () => {
      expect(extractTicketKeys('A-1')).toEqual([])
    })

    it('a prefix longer than ten characters', () => {
      expect(extractTicketKeys('ABCDEFGHIJK-1')).toEqual([])
    })

    it('more than six digits', () => {
      expect(extractTicketKeys('ATON-1234567')).toEqual([])
    })

    it('a bare number with no prefix', () => {
      expect(extractTicketKeys('2024-1234')).toEqual([])
    })
  })

  describe('learned project prefixes override the rejection list', () => {
    it('accepts a colliding prefix once it is known', () => {
      const known = learnProjectPrefixes(['ES-4001'])
      expect(extractTicketKeys('ES-4002 done')).toEqual([])
      expect(extractTicketKeys('ES-4002 done', known)).toEqual(['ES-4002'])
    })

    it('does not weaken the two-letter rule', () => {
      // A learned prefix is an exemption from the denylist only; structurally
      // impossible keys stay impossible.
      const known = learnProjectPrefixes(['V2-1'])
      expect(extractTicketKeys('src/v2-1/index.ts', known)).toEqual([])
    })
  })
})

describe('learnProjectPrefixes', () => {
  it('takes the prefix of each key', () => {
    expect([...learnProjectPrefixes(['ATON-1', 'TRAC-22'])].sort()).toEqual(['ATON', 'TRAC'])
  })

  it('upper-cases what it learns', () => {
    expect([...learnProjectPrefixes(['aton-1'])]).toEqual(['ATON'])
  })

  it('de-duplicates', () => {
    expect([...learnProjectPrefixes(['ATON-1', 'ATON-2', 'ATON-3'])]).toEqual(['ATON'])
  })

  it('ignores anything without a dash', () => {
    expect([...learnProjectPrefixes(['nonsense', '', '-5'])]).toEqual([])
  })
})

describe('extractDeclaredKeys', () => {
  it('accepts the lowercase form people actually type', () => {
    expect(extractDeclaredKeys('always include aton-5555 as WIP')).toEqual(['ATON-5555'])
  })

  it('does not turn a technical standard into a permanent allowance', () => {
    // This was the bug: any note mentioning UTF-8 whitelisted a fake key for
    // the whole run.
    expect(extractDeclaredKeys('all files are UTF-8')).toEqual([])
  })
})

describe('collectEvidenceKeys', () => {
  it('reads keys out of every part of a session digest', () => {
    const keys = collectEvidenceKeys(
      [
        digest({ cwd: 'C:/repos/AAAA-1' }),
        digest({ gitBranch: 'feature/BBBB-2' }),
        digest({ userPrompts: ['fix CCCC-3'] }),
        digest({ assistantSummaries: ['done with DDDD-4'] }),
        digest({ delegations: ['review EEEE-5'] }),
        digest({ filesChanged: ['src/FFFF-6.ts'] }),
        digest({ commands: ['git checkout GGGG-7'] }),
      ],
      [],
    )
    expect([...keys].sort()).toEqual([
      'AAAA-1', 'BBBB-2', 'CCCC-3', 'DDDD-4', 'EEEE-5', 'FFFF-6', 'GGGG-7',
    ])
  })

  it('reads keys out of every part of the git evidence', () => {
    const keys = collectEvidenceKeys(
      [],
      [
        repo({ repoPath: 'C:/repos/HHHH-1' }),
        repo({ branch: 'feature/IIII-2' }),
        repo({ commitsToday: ['abc [10:00] JJJJ-3 fix it'] }),
        repo({ uncommitted: '1 file changed today: src/KKKK-4.ts' }),
      ],
    )
    expect([...keys].sort()).toEqual(['HHHH-1', 'IIII-2', 'JJJJ-3', 'KKKK-4'])
  })

  it('is empty when there is no evidence', () => {
    expect(collectEvidenceKeys([], []).size).toBe(0)
  })

  it('merges duplicates across sources', () => {
    const keys = collectEvidenceKeys(
      [digest({ gitBranch: 'feature/ATON-1' })],
      [repo({ commitsToday: ['abc [10:00] ATON-1 fix'] })],
    )
    expect([...keys]).toEqual(['ATON-1'])
  })

  it('honours learned prefixes', () => {
    const digests = [digest({ userPrompts: ['working on ES-4002'] })]
    expect(collectEvidenceKeys(digests, []).size).toBe(0)
    expect([...collectEvidenceKeys(digests, [], learnProjectPrefixes(['ES-1']))]).toEqual(['ES-4002'])
  })
})
