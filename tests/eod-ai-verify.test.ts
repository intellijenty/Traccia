import { describe, expect, it } from 'vitest'
import {
  coerceFactSheet,
  extractJson,
  isEmptyFactSheet,
  screenFactSheet,
  verifyDraft,
} from '../electron/eod-ai-verify'
import { learnProjectPrefixes } from '../electron/eod-ai-keys'
import { factSheet, rawDraft, ticket } from './helpers'

const FENCE = '```'

describe('extractJson', () => {
  it('parses a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('parses out of a fenced block', () => {
    expect(extractJson(FENCE + 'json\n{"a":1}\n' + FENCE)).toEqual({ a: 1 })
  })

  it('parses out of an unlabelled fence', () => {
    expect(extractJson(FENCE + '\n{"a":1}\n' + FENCE)).toEqual({ a: 1 })
  })

  it('ignores prose either side', () => {
    expect(extractJson('Here you go:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 })
  })

  it('is not fooled by braces inside strings', () => {
    // A greedy brace regex stops at the first } and produces nothing usable.
    expect(extractJson('{"a":"a } brace","b":2}')).toEqual({ a: 'a } brace', b: 2 })
  })

  it('is not fooled by escaped quotes', () => {
    expect(extractJson('{"a":"say \\"hi\\" } now","b":2}')).toEqual({ a: 'say "hi" } now', b: 2 })
  })

  it('handles nesting', () => {
    expect(extractJson('{"a":{"b":{"c":1}}}')).toEqual({ a: { b: { c: 1 } } })
  })

  it('returns null for input with no object', () => {
    expect(extractJson('no json at all')).toBeNull()
  })

  it('returns null for malformed json', () => {
    expect(extractJson('{"a":}')).toBeNull()
  })

  it('returns null for non-strings and blanks', () => {
    expect(extractJson(null as unknown as string)).toBeNull()
    expect(extractJson('   ')).toBeNull()
  })
})

describe('coerceFactSheet', () => {
  it('returns null only when the input is not a fact sheet at all', () => {
    expect(coerceFactSheet(null)).toBeNull()
    expect(coerceFactSheet('nope')).toBeNull()
    expect(coerceFactSheet(42)).toBeNull()
  })

  it('accepts a well-formed but empty sheet', () => {
    // Distinguishing this from unparseable output is what lets the orchestrator
    // say "the analysis found nothing" instead of reporting a parse error.
    expect(coerceFactSheet({ tickets: [], unmatchedWork: [] })).toEqual({
      tickets: [],
      unmatchedWork: [],
    })
  })

  it('tolerates missing arrays', () => {
    expect(coerceFactSheet({})).toEqual({ tickets: [], unmatchedWork: [] })
  })

  it('drops a meetings array if the model still emits one', () => {
    const result = coerceFactSheet({ tickets: [], meetings: ['standup'], unmatchedWork: ['x'] })
    expect(Object.keys(result!).sort()).toEqual(['tickets', 'unmatchedWork'])
  })

  it('normalises ticket keys to upper case', () => {
    const result = coerceFactSheet({ tickets: [{ key: 'aton-100' }] })
    expect(result!.tickets[0].key).toBe('ATON-100')
  })

  it('discards entries whose key is not key-shaped', () => {
    const result = coerceFactSheet({
      tickets: [{ key: 'nonsense' }, { key: '' }, { key: 'ATON-100' }],
    })
    expect(result!.tickets.map(t => t.key)).toEqual(['ATON-100'])
  })

  it('falls back to the key when no title is given', () => {
    expect(coerceFactSheet({ tickets: [{ key: 'ATON-100' }] })!.tickets[0].title).toBe('ATON-100')
  })

  it('treats any status other than done as wip', () => {
    const sheet = coerceFactSheet({
      tickets: [
        { key: 'ATON-1', statusSignal: 'done' },
        { key: 'ATON-2', statusSignal: 'nonsense' },
        { key: 'ATON-3' },
      ],
    })
    expect(sheet!.tickets.map(t => t.statusSignal)).toEqual(['done', 'wip', 'wip'])
  })

  it('accepts actions as objects or bare strings', () => {
    const sheet = coerceFactSheet({
      tickets: [{ key: 'ATON-1', actions: [{ text: 'a', source: 'git' }, 'b', { text: '  ' }, 42] }],
    })
    expect(sheet!.tickets[0].actions).toEqual([
      { text: 'a', source: 'git' },
      { text: 'b', source: 'unknown' },
    ])
  })

  it('keeps only non-blank unmatched work', () => {
    const sheet = coerceFactSheet({ unmatchedWork: ['real', '   ', '', 7] })
    expect(sheet!.unmatchedWork).toEqual(['real'])
  })
})

describe('isEmptyFactSheet', () => {
  it('is true with neither tickets nor unmatched work', () => {
    expect(isEmptyFactSheet(factSheet())).toBe(true)
  })

  it('is false with a ticket', () => {
    expect(isEmptyFactSheet(factSheet({ tickets: [ticket()] }))).toBe(false)
  })

  it('is false with unmatched work alone', () => {
    // A day of entirely ticketless work is a perfectly good EOD.
    expect(isEmptyFactSheet(factSheet({ unmatchedWork: ['fixed the build'] }))).toBe(false)
  })
})

describe('screenFactSheet', () => {
  const opts = (over = {}) => ({
    evidenceKeys: new Set<string>(),
    declaredKeys: [] as string[],
    jiraConsulted: false,
    ...over,
  })

  it('keeps a ticket backed by local evidence', () => {
    const result = screenFactSheet(
      factSheet({ tickets: [ticket({ key: 'ATON-100' })] }),
      opts({ evidenceKeys: new Set(['ATON-100']) }),
    )
    expect(result.factSheet.tickets.map(t => t.key)).toEqual(['ATON-100'])
    expect(result.droppedTickets).toEqual([])
  })

  it('drops a ticket that appears nowhere in the evidence', () => {
    // The stale-history leak: a key lifted out of the past-EOD title index.
    const result = screenFactSheet(
      factSheet({ tickets: [ticket({ key: 'ATON-999', title: 'Old work', titleSource: 'pastEod' })] }),
      opts(),
    )
    expect(result.factSheet.tickets).toEqual([])
    expect(result.droppedTickets).toEqual(['ATON-999 - Old work'])
  })

  it('keeps a ticket the user declared even with no other trace', () => {
    const result = screenFactSheet(
      factSheet({ tickets: [ticket({ key: 'ATON-555' })] }),
      opts({ declaredKeys: ['ATON-555'] }),
    )
    expect(result.factSheet.tickets.map(t => t.key)).toEqual(['ATON-555'])
  })

  it('matches declared keys regardless of case', () => {
    const result = screenFactSheet(
      factSheet({ tickets: [ticket({ key: 'ATON-555' })] }),
      opts({ declaredKeys: ['aton-555'] }),
    )
    expect(result.factSheet.tickets).toHaveLength(1)
  })

  it('keeps Jira-sourced work when Jira was genuinely queried', () => {
    // Work done only inside Jira - a transition, a comment, manual QA - leaves
    // no local trace and is still real.
    const result = screenFactSheet(
      factSheet({ tickets: [ticket({ key: 'ATON-777', titleSource: 'jira' })] }),
      opts({ jiraConsulted: true }),
    )
    expect(result.factSheet.tickets.map(t => t.key)).toEqual(['ATON-777'])
  })

  it('rejects a Jira claim when no Jira tool was called', () => {
    // The claim is self-reported, so it is only trusted when a tool call backs it.
    const result = screenFactSheet(
      factSheet({ tickets: [ticket({ key: 'ATON-777', titleSource: 'jira' })] }),
      opts({ jiraConsulted: false }),
    )
    expect(result.factSheet.tickets).toEqual([])
    expect(result.droppedTickets).toHaveLength(1)
  })

  it('does not extend the Jira allowance to other sources', () => {
    const result = screenFactSheet(
      factSheet({ tickets: [ticket({ key: 'ATON-777', titleSource: 'pastEod' })] }),
      opts({ jiraConsulted: true }),
    )
    expect(result.factSheet.tickets).toEqual([])
  })

  it('leaves unmatched work untouched', () => {
    const result = screenFactSheet(
      factSheet({ tickets: [ticket({ key: 'ATON-999' })], unmatchedWork: ['fixed the build'] }),
      opts(),
    )
    expect(result.factSheet.unmatchedWork).toEqual(['fixed the build'])
  })

  it('does not mutate the sheet it was given', () => {
    const original = factSheet({ tickets: [ticket({ key: 'ATON-999' })] })
    screenFactSheet(original, opts())
    expect(original.tickets).toHaveLength(1)
  })
})

describe('verifyDraft', () => {
  const sheet = factSheet({ tickets: [ticket({ key: 'ATON-100' })] })
  const project = (over = {}) => ({
    name: 'ATON',
    status: 'green',
    statusNote: null,
    tasksCompleted: [],
    ...over,
  })

  it('returns null for input that is not an object', () => {
    expect(verifyDraft(null, sheet)).toBeNull()
    expect(verifyDraft('nope', sheet)).toBeNull()
  })

  it('returns null when there is neither content nor anything dropped', () => {
    expect(verifyDraft(rawDraft(), sheet)).toBeNull()
  })

  it('keeps a task whose key is in the fact sheet', () => {
    const result = verifyDraft(
      rawDraft({
        projects: [project({ tasksCompleted: [{ text: 'ATON-100 - real work', subBullets: [] }] })],
      }),
      sheet,
    )
    expect(result!.draft.projects[0].tasksCompleted).toHaveLength(1)
    expect(result!.dropped).toEqual([])
  })

  it('drops a task naming a key the fact sheet does not have', () => {
    const result = verifyDraft(
      rawDraft({
        projects: [project({ tasksCompleted: [{ text: 'ATON-999 - invented', subBullets: [] }] })],
      }),
      sheet,
    )
    expect(result!.draft.projects).toEqual([])
    expect(result!.dropped).toEqual(['ATON-999 - invented'])
  })

  it('drops a task whose stale key is mid-sentence', () => {
    // An anchored check only looked at the start of the line and never saw this.
    const result = verifyDraft(
      rawDraft({
        projects: [
          project({ tasksCompleted: [{ text: 'Continued work on ATON-999 quota', subBullets: [] }] }),
        ],
      }),
      sheet,
    )
    expect(result!.dropped).toEqual(['Continued work on ATON-999 quota'])
  })

  it('accepts keys the user declared', () => {
    const result = verifyDraft(
      rawDraft({
        projects: [project({ tasksCompleted: [{ text: 'ATON-555 - declared', subBullets: [] }] })],
      }),
      sheet,
      ['ATON-555'],
    )
    expect(result!.draft.projects[0].tasksCompleted).toHaveLength(1)
  })

  it('drops only the offending sub-bullet, not its task', () => {
    const result = verifyDraft(
      rawDraft({
        projects: [
          project({
            tasksCompleted: [
              {
                text: 'ATON-100 - real work',
                subBullets: [{ text: 'reviewed the PR' }, { text: 'also touched ATON-999' }],
              },
            ],
          }),
        ],
      }),
      sheet,
    )
    expect(result!.draft.projects[0].tasksCompleted[0].subBullets).toEqual([
      { text: 'reviewed the PR' },
    ])
    expect(result!.dropped).toEqual(['also touched ATON-999'])
  })

  it('clears a status note carrying a stale key without dropping the project', () => {
    const result = verifyDraft(
      rawDraft({
        projects: [
          project({
            statusNote: 'blocked by ATON-999',
            tasksCompleted: [{ text: 'ATON-100 - real work', subBullets: [] }],
          }),
        ],
      }),
      sheet,
    )
    expect(result!.draft.projects[0].statusNote).toBeNull()
    expect(result!.draft.projects[0].tasksCompleted).toHaveLength(1)
    expect(result!.dropped).toEqual(['blocked by ATON-999'])
  })

  it('filters the simple sections too', () => {
    const result = verifyDraft(
      rawDraft({
        projects: [project({ tasksCompleted: [{ text: 'ATON-100 - real', subBullets: [] }] })],
        nextDayPlan: {
          items: [{ text: 'Continue ATON-999 testing' }, { text: 'Continue ATON-100' }],
          isNA: false,
        },
      }),
      sheet,
    )
    expect(result!.draft.nextDayPlan.items).toEqual([{ text: 'Continue ATON-100' }])
    expect(result!.dropped).toEqual(['Continue ATON-999 testing'])
  })

  it('does not treat a technical standard in a real line as a key', () => {
    const result = verifyDraft(
      rawDraft({
        projects: [
          project({ tasksCompleted: [{ text: 'ATON-100 - fixed UTF-8 encoding', subBullets: [] }] }),
        ],
      }),
      sheet,
    )
    expect(result!.draft.projects[0].tasksCompleted).toHaveLength(1)
    expect(result!.dropped).toEqual([])
  })

  it('honours learned prefixes when checking lines', () => {
    const esSheet = factSheet({ tickets: [ticket({ key: 'ES-4001' })] })
    const draft = rawDraft({
      projects: [
        project({ tasksCompleted: [{ text: 'ES-4002 - not in the sheet', subBullets: [] }] }),
      ],
    })
    // Without the learned prefix, ES-4002 is not even recognised as a key, so
    // the line survives; with it, the line is correctly rejected.
    expect(verifyDraft(draft, esSheet)!.draft.projects[0].tasksCompleted).toHaveLength(1)
    expect(verifyDraft(draft, esSheet, [], learnProjectPrefixes(['ES-4001']))!.dropped).toEqual([
      'ES-4002 - not in the sheet',
    ])
  })

  it('de-duplicates identical task lines', () => {
    const result = verifyDraft(
      rawDraft({
        projects: [
          project({
            tasksCompleted: [
              { text: 'ATON-100 - real', subBullets: [] },
              { text: 'aton-100 - REAL', subBullets: [] },
            ],
          }),
        ],
      }),
      sheet,
    )
    expect(result!.draft.projects[0].tasksCompleted).toHaveLength(1)
  })

  it('drops a project left with no tasks and no note', () => {
    const result = verifyDraft(
      rawDraft({
        projects: [
          project({ name: 'Empty' }),
          project({ tasksCompleted: [{ text: 'ATON-100 - real', subBullets: [] }] }),
        ],
      }),
      sheet,
    )
    expect(result!.draft.projects.map(p => p.name)).toEqual(['ATON'])
  })

  it('names an unnamed project rather than losing its work', () => {
    const result = verifyDraft(
      rawDraft({
        projects: [
          project({ name: '', tasksCompleted: [{ text: 'ATON-100 - real', subBullets: [] }] }),
        ],
      }),
      sheet,
    )
    expect(result!.draft.projects[0].name).toBe('Project')
  })

  it('falls back to green for an unrecognised status', () => {
    const result = verifyDraft(
      rawDraft({
        projects: [
          project({
            status: 'purple',
            tasksCompleted: [{ text: 'ATON-100 - real', subBullets: [] }],
          }),
        ],
      }),
      sheet,
    )
    expect(result!.draft.projects[0].status).toBe('green')
  })

  it.each(['yellow', 'red', 'none'])('keeps a valid status (%s)', status => {
    const result = verifyDraft(
      rawDraft({
        projects: [
          project({ status, tasksCompleted: [{ text: 'ATON-100 - real', subBullets: [] }] }),
        ],
      }),
      sheet,
    )
    expect(result!.draft.projects[0].status).toBe(status)
  })

  it('survives a day of entirely ticketless work', () => {
    const result = verifyDraft(
      rawDraft({ otherTasks: { items: [{ text: 'fixed the build' }], isNA: false } }),
      sheet,
    )
    expect(result!.draft.otherTasks.items).toEqual([{ text: 'fixed the build' }])
  })

  it('reports a draft that was emptied entirely by filtering', () => {
    const result = verifyDraft(
      rawDraft({
        projects: [project({ tasksCompleted: [{ text: 'ATON-999 - invented', subBullets: [] }] })],
      }),
      sheet,
    )
    expect(result).not.toBeNull()
    expect(result!.dropped).toHaveLength(1)
  })

  describe('isNA is derived, never trusted', () => {
    it('marks a section N/A when it has no items', () => {
      const result = verifyDraft(
        rawDraft({
          projects: [project({ tasksCompleted: [{ text: 'ATON-100 - real', subBullets: [] }] })],
          concerns: { items: [], isNA: false },
        }),
        sheet,
      )
      expect(result!.draft.concerns).toEqual({ items: [], isNA: true })
    })

    it('un-marks a section that has items', () => {
      const result = verifyDraft(
        rawDraft({ otherTasks: { items: [{ text: 'fixed the build' }], isNA: true } }),
        sheet,
      )
      expect(result!.draft.otherTasks).toEqual({
        items: [{ text: 'fixed the build' }],
        isNA: false,
      })
    })

    it('marks a section N/A once filtering has emptied it', () => {
      // The live-run finding: a section that arrived not-N/A and lost its only
      // item rendered as present but blank.
      const result = verifyDraft(
        rawDraft({ nextDayPlan: { items: [{ text: 'Continue ATON-999 testing' }], isNA: false } }),
        sheet,
      )
      expect(result!.draft.nextDayPlan).toEqual({ items: [], isNA: true })
    })

    it('ignores blank items when deciding', () => {
      const result = verifyDraft(
        rawDraft({
          projects: [project({ tasksCompleted: [{ text: 'ATON-100 - real', subBullets: [] }] })],
          otherTasks: { items: [{ text: '   ' }, { text: '' }], isNA: false },
        }),
        sheet,
      )
      expect(result!.draft.otherTasks).toEqual({ items: [], isNA: true })
    })
  })
})
