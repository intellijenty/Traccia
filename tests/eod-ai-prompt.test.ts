import { describe, expect, it } from 'vitest'
import {
  buildGatherPrompt,
  buildRefinePrompt,
  buildWritePrompt,
  extractTicketIndex,
} from '../electron/eod-ai-prompt'
import { TRACCIA_EOD_SENTINEL } from '../electron/eod-session-digest'
import { digest, factSheet, repo, ticket } from './helpers'

const gather = (over = {}) =>
  buildGatherPrompt({
    todayDate: '2026-08-26',
    digests: [],
    git: [],
    meetings: [],
    ticketIndex: [],
    notes: '',
    instructions: '',
    ...over,
  })

const write = (over = {}) =>
  buildWritePrompt({
    todayDate: '2026-08-26',
    factSheet: factSheet(),
    pastEods: [],
    instructions: '',
    notes: '',
    ...over,
  })

describe('extractTicketIndex', () => {
  const eod = (plainText: string, date = '2026-08-25') => ({ date, plainText })

  it('reads a key and its title', () => {
    expect(extractTicketIndex([eod('ATON-100 - Fix the quota rounding')])).toEqual([
      { key: 'ATON-100', title: 'Fix the quota rounding' },
    ])
  })

  it.each(['-', '\u2013', '\u2014', ':'])('accepts %s as the separator', sep => {
    expect(extractTicketIndex([eod('ATON-100 ' + sep + ' Fix the quota')])[0].title).toBe(
      'Fix the quota',
    )
  })

  it('stops the title at a status arrow', () => {
    expect(extractTicketIndex([eod('ATON-100 - Fix the quota \u2192 WIP')])[0].title).toBe(
      'Fix the quota',
    )
  })

  it('lets the newest EOD win, since titles get renamed', () => {
    const index = extractTicketIndex([
      eod('ATON-100 - New title', '2026-08-25'),
      eod('ATON-100 - Old title', '2026-08-01'),
    ])
    expect(index).toEqual([{ key: 'ATON-100', title: 'New title' }])
  })

  it('collapses runs of whitespace in a title', () => {
    expect(extractTicketIndex([eod('ATON-100 -   Fix    the   quota')])[0].title).toBe(
      'Fix the quota',
    )
  })

  it('ignores a title that is too short to be one', () => {
    expect(extractTicketIndex([eod('ATON-100 - ab')])).toEqual([])
  })

  it('ignores lowercase keys, which are prose rather than a report line', () => {
    expect(extractTicketIndex([eod('aton-100 - some note')])).toEqual([])
  })

  it('tolerates entries with no usable text', () => {
    expect(
      extractTicketIndex([
        { date: 'x', plainText: null as unknown as string },
        eod('ATON-100 - Fix the quota'),
      ]),
    ).toHaveLength(1)
  })

  it('stops at sixty entries', () => {
    const lines = Array.from({ length: 80 }, (_, i) => 'ATON-' + (i + 1) + ' - Title number ' + i)
    expect(extractTicketIndex([eod(lines.join('\n'))])).toHaveLength(60)
  })
})

describe('buildGatherPrompt', () => {
  it('opens with the sentinel, so the run is never digested as work', () => {
    expect(gather().startsWith(TRACCIA_EOD_SENTINEL)).toBe(true)
  })

  it('states the date', () => {
    expect(gather()).toContain('2026-08-26')
  })

  it('says plainly when a source is empty', () => {
    const prompt = gather()
    expect(prompt).toContain('no Claude Code sessions found today')
    expect(prompt).toContain('no git activity detected today')
    expect(prompt).toContain('(no meetings today)')
  })

  it('includes what a session actually did', () => {
    const prompt = gather({
      digests: [
        digest({
          cwd: 'C:/repos/app',
          gitBranch: 'feature/ATON-1',
          userPrompts: ['fix the quota'],
          assistantSummaries: ['Fixed the rounding'],
          filesChanged: ['src/quota.ts'],
          commands: ['npm test'],
          delegations: ['Audit the API'],
        }),
      ],
    })
    expect(prompt).toContain('C:/repos/app')
    expect(prompt).toContain('feature/ATON-1')
    expect(prompt).toContain('fix the quota')
    expect(prompt).toContain('Fixed the rounding')
    expect(prompt).toContain('Files changed: src/quota.ts')
    expect(prompt).toContain('npm test')
    expect(prompt).toContain('Audit the API')
  })

  it('includes git commits and dated uncommitted work', () => {
    const prompt = gather({
      git: [
        repo({
          commitsToday: ['abc [10:00] ATON-1 fix it'],
          uncommitted: '2 files changed today: a.ts, b.ts',
        }),
      ],
    })
    expect(prompt).toContain('abc [10:00] ATON-1 fix it')
    expect(prompt).toContain('2 files changed today: a.ts, b.ts')
  })

  it('marks meetings as context and never as an output', () => {
    const prompt = gather({ meetings: [{ title: 'Sprint planning', durationMin: 30 }] })
    expect(prompt).toContain('Sprint planning')
    expect(prompt).toContain('never an output')
  })

  it('never asks for a meetings array back', () => {
    // The analyst used to produce one that the writer was then told to ignore.
    expect(gather()).not.toContain('"meetings"')
  })

  it('warns that the past-EOD index is for titles only', () => {
    const prompt = gather({ ticketIndex: [{ key: 'ATON-100', title: 'Old work' }] })
    expect(prompt).toContain('ATON-100 - Old work')
    expect(prompt).toContain('TITLE LOOKUP ONLY')
  })

  it('includes user notes as authoritative when there are any', () => {
    expect(gather({ notes: 'also onboarded the interns' })).toContain('also onboarded the interns')
  })

  it('leaves the notes section out entirely when there are none', () => {
    expect(gather()).not.toContain('USER-DECLARED FACTS')
  })

  it('includes standing instructions when there are any', () => {
    expect(gather({ instructions: 'never say Done' })).toContain('never say Done')
  })

  it('leaves the instructions section out when there are none', () => {
    expect(gather()).not.toContain('USER STANDING INSTRUCTIONS')
  })

  it('trims one very large session rather than growing without limit', () => {
    // A single session gets the largest per-session budget there is (8k chars),
    // so the fixture has to be comfortably past that to prove trimming happens.
    const huge = digest({ userPrompts: Array.from({ length: 200 }, (_, i) => 'prompt ' + i + ' ' + 'x'.repeat(100)) })
    const prompt = gather({ digests: [huge] })
    expect(prompt).toContain('[trimmed]')
    expect(prompt.length).toBeLessThan(20_000)
  })

  it('stays bounded when there are many sessions', () => {
    const many = Array.from({ length: 60 }, () =>
      digest({ assistantSummaries: ['x'.repeat(5000)] }),
    )
    expect(gather({ digests: many }).length).toBeLessThan(200_000)
  })

  describe('the tool-free rerun', () => {
    it('does not ask for a Jira query', () => {
      expect(gather({ offline: true })).not.toContain('assignee = currentUser()')
    })

    it('says outright that there are no tools', () => {
      expect(gather({ offline: true })).toContain('You have NO tools on this run')
    })

    it('forbids claiming a Jira source it could not have used', () => {
      expect(gather({ offline: true })).toContain('Never use titleSource "jira"')
    })

    it('still carries the whole evidence set', () => {
      const args = { digests: [digest({ userPrompts: ['fix the quota'] })] }
      expect(gather({ ...args, offline: true })).toContain('fix the quota')
    })
  })

  it('asks for a Jira query on the normal run', () => {
    expect(gather()).toContain('assignee = currentUser()')
  })
})

describe('buildWritePrompt', () => {
  it('opens with the sentinel', () => {
    expect(write().startsWith(TRACCIA_EOD_SENTINEL)).toBe(true)
  })

  it('passes the fact sheet through as the only source of truth', () => {
    const prompt = write({
      factSheet: factSheet({ tickets: [ticket({ key: 'ATON-100', title: 'Fix the quota' })] }),
    })
    expect(prompt).toContain('ATON-100')
    expect(prompt).toContain('Fix the quota')
    expect(prompt).toContain('the only source of truth')
  })

  it('includes past EODs as the style to copy', () => {
    const prompt = write({ pastEods: [{ date: '2026-08-25', plainText: 'ATON-1 - Old work' }] })
    expect(prompt).toContain('EOD sent on 2026-08-25')
    expect(prompt).toContain('ATON-1 - Old work')
  })

  it('says so when there are no past EODs to copy', () => {
    expect(write()).toContain('(no past EODs available)')
  })

  it('keeps past EODs within budget', () => {
    const long = { date: '2026-08-25', plainText: 'x'.repeat(50_000) }
    expect(write({ pastEods: [long, long, long] }).length).toBeLessThan(30_000)
  })

  it('forbids writing meeting lines, which the app adds itself', () => {
    expect(write()).toContain('do NOT output any meeting lines')
  })

  it('forbids writing holidays, which the app adds itself', () => {
    expect(write()).toContain('never write holiday or leave entries yourself')
  })

  it('insists unmatched work reaches the report', () => {
    // Left to itself the model marks otherTasks N/A and the ticketless work
    // simply disappears.
    expect(write()).toContain('MUST appear in otherTasks.items')
  })

  it('puts user rules above the default rules', () => {
    const prompt = write({ instructions: 'keep bullets short', notes: 'mention the interns' })
    expect(prompt).toContain('override ALL default rules')
    expect(prompt).toContain('keep bullets short')
    expect(prompt).toContain('mention the interns')
  })

  it('leaves the user-rules section out when there are none', () => {
    expect(write()).not.toContain('USER RULES')
  })
})

describe('buildRefinePrompt', () => {
  const refine = (over = {}) =>
    buildRefinePrompt({
      todayDate: '2026-08-26',
      factSheet: factSheet({ tickets: [ticket({ key: 'ATON-100' })] }),
      previousDraft: { projects: [] },
      instruction: 'make the second bullet vaguer',
      instructions: '',
      ...over,
    })

  it('opens with the sentinel', () => {
    expect(refine().startsWith(TRACCIA_EOD_SENTINEL)).toBe(true)
  })

  it('carries the request, the previous draft and the fact sheet', () => {
    const prompt = refine()
    expect(prompt).toContain('make the second bullet vaguer')
    expect(prompt).toContain('PREVIOUS DRAFT')
    expect(prompt).toContain('ATON-100')
  })

  it('asks for that one change and nothing else', () => {
    expect(refine()).toContain('do not "improve" unrelated parts')
  })

  it('still forbids inventing work', () => {
    expect(refine()).toContain('never add content beyond it')
  })
})

describe('no prompt mentions Bitbucket', () => {
  // It was never reachable, and asking for it invited the model to claim it
  // had checked.
  it.each([
    ['gather', gather()],
    ['gather offline', gather({ offline: true })],
    ['write', write()],
  ])('%s', (_label, prompt) => {
    expect(prompt.toLowerCase()).not.toContain('bitbucket')
  })
})
