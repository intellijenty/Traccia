import { describe, expect, it } from 'vitest'
import { mergeSelected } from '../src/lib/eod-ai-inject'
import type { EodFormState } from '../src/lib/eod-types'

const form = (over: Partial<EodFormState> = {}): EodFormState => ({
  date: '2026-08-26',
  projects: [],
  otherTasks: { items: [], isNA: true },
  concerns: { items: [], isNA: true },
  nextDayPlan: { items: [], isNA: true },
  upcomingHolidays: { items: [], isNA: true },
  ...over,
})

const project = (over = {}) => ({
  id: 'p1',
  name: 'ATON',
  status: 'green' as const,
  statusNote: null,
  tasksCompleted: [],
  ...over,
})

const task = (id: string, text: string, over = {}) => ({ id, text, subBullets: [], ...over })

const add = (
  current: EodFormState,
  subset: EodFormState,
  replace = false,
) => mergeSelected(current, subset, { replace })

describe('mergeSelected', () => {
  describe('adding to the current draft', () => {
    it('appends the incoming work to a project of the same name', () => {
      const current = form({
        projects: [project({ tasksCompleted: [task('t1', 'existing work')] })],
      })
      const subset = form({
        projects: [project({ id: 'x', tasksCompleted: [task('t2', 'new work')] })],
      })
      const result = add(current, subset)
      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].tasksCompleted.map(t => t.text)).toEqual([
        'existing work',
        'new work',
      ])
    })

    it('matches a project name regardless of case and padding', () => {
      const current = form({ projects: [project({ name: 'aton  ' })] })
      const subset = form({
        projects: [project({ id: 'x', name: 'ATON', tasksCompleted: [task('t2', 'new')] })],
      })
      expect(add(current, subset).projects).toHaveLength(1)
    })

    it('leaves the status the user chose alone', () => {
      const current = form({
        projects: [project({ status: 'red', statusNote: 'blocked on infra' })],
      })
      const subset = form({
        projects: [project({ id: 'x', status: 'green', statusNote: null, tasksCompleted: [task('t2', 'new')] })],
      })
      const result = add(current, subset)
      expect(result.projects[0].status).toBe('red')
      expect(result.projects[0].statusNote).toBe('blocked on infra')
    })

    it('reuses the blank starter project rather than leaving it stranded', () => {
      const current = form({ projects: [project({ name: '' })] })
      const subset = form({
        projects: [project({ id: 'x', name: 'TRAC', tasksCompleted: [task('t2', 'new')] })],
      })
      const result = add(current, subset)
      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].name).toBe('TRAC')
    })

    it('reuses the blank project only once', () => {
      const current = form({ projects: [project({ name: '' })] })
      const subset = form({
        projects: [
          project({ id: 'x', name: 'ATON', tasksCompleted: [task('t2', 'a')] }),
          project({ id: 'y', name: 'TRAC', tasksCompleted: [task('t3', 'b')] }),
        ],
      })
      const result = add(current, subset)
      expect(result.projects.map(p => p.name)).toEqual(['ATON', 'TRAC'])
    })

    it('adds a new project when no name matches', () => {
      const current = form({ projects: [project({ tasksCompleted: [task('t1', 'existing')] })] })
      const subset = form({
        projects: [project({ id: 'x', name: 'TRAC', tasksCompleted: [task('t2', 'new')] })],
      })
      expect(add(current, subset).projects.map(p => p.name)).toEqual(['ATON', 'TRAC'])
    })

    it('appends section items and clears the N/A mark', () => {
      const current = form()
      const subset = form({ otherTasks: { items: [{ id: 'o1', text: 'other work' }], isNA: false } })
      const result = add(current, subset)
      expect(result.otherTasks.items.map(i => i.text)).toEqual(['other work'])
      expect(result.otherTasks.isNA).toBe(false)
    })

    it('leaves a section untouched when nothing is coming for it', () => {
      const current = form({ concerns: { items: [{ id: 'c1', text: 'mine' }], isNA: false } })
      const result = add(current, form())
      expect(result.concerns.items.map(i => i.text)).toEqual(['mine'])
    })
  })

  describe('replacing the current draft', () => {
    it('clears the work the user had', () => {
      const current = form({
        projects: [project({ tasksCompleted: [task('t1', 'old work')] })],
        otherTasks: { items: [{ id: 'o1', text: 'old other' }], isNA: false },
      })
      const subset = form({
        projects: [project({ id: 'x', tasksCompleted: [task('t2', 'new work')] })],
      })
      const result = add(current, subset, true)
      expect(result.projects[0].tasksCompleted.map(t => t.text)).toEqual(['new work'])
      expect(result.otherTasks.items).toEqual([])
    })

    it('keeps meetings the app imported', () => {
      const current = form({
        projects: [
          project({
            tasksCompleted: [
              task('t1', 'my work'),
              task('m1', 'Attended sprint planning', { meetingKey: 'meeting-1' }),
            ],
          }),
        ],
      })
      const result = add(current, form(), true)
      expect(result.projects[0].tasksCompleted.map(t => t.text)).toEqual([
        'Attended sprint planning',
      ])
    })

    it('keeps meeting items in the simple sections', () => {
      const current = form({
        otherTasks: {
          items: [
            { id: 'o1', text: 'my work' },
            { id: 'm1', text: 'Attended standup', meetingKey: 'meeting-1' },
          ],
          isNA: false,
        },
      })
      const result = add(current, form(), true)
      expect(result.otherTasks.items.map(i => i.text)).toEqual(['Attended standup'])
    })

    it('keeps approved leave', () => {
      const current = form({
        upcomingHolidays: {
          items: [
            { id: 'h1', text: 'typed by hand' },
            { id: 'h2', text: 'Diwali', leaveKey: '2026-11-08' },
          ],
          isNA: false,
        },
      })
      const result = add(current, form(), true)
      expect(result.upcomingHolidays.items.map(i => i.text)).toEqual(['Diwali'])
    })
  })

  describe('identity', () => {
    it('gives every merged row a fresh id', () => {
      const current = form()
      const subset = form({
        projects: [
          project({
            id: 'x',
            tasksCompleted: [task('t2', 'new', { subBullets: [{ id: 's1', text: 'detail' }] })],
          }),
        ],
      })
      const result = add(current, subset)
      const merged = result.projects[0].tasksCompleted[0]
      expect(merged.id).not.toBe('t2')
      expect(merged.subBullets[0].id).not.toBe('s1')
    })

    it('lets the same item be added twice without an id collision', () => {
      const subset = form({
        projects: [project({ id: 'x', tasksCompleted: [task('t2', 'new work')] })],
      })
      const once = add(form(), subset)
      const twice = add(once, subset)
      const tasks = twice.projects[0].tasksCompleted
      expect(tasks).toHaveLength(2)
      expect(tasks[0].id).not.toBe(tasks[1].id)
    })

    it('carries a meeting key through the merge', () => {
      const subset = form({
        projects: [
          project({
            id: 'x',
            tasksCompleted: [task('m1', 'Attended standup', { meetingKey: 'meeting-1' })],
          }),
        ],
      })
      expect(add(form(), subset).projects[0].tasksCompleted[0].meetingKey).toBe('meeting-1')
    })
  })

  it('never leaves the form without a project to hold work', () => {
    // The drag-and-drop layout needs a container to exist.
    expect(add(form(), form(), true).projects).toHaveLength(1)
  })

  it('does not mutate either input', () => {
    const current = form({ projects: [project({ tasksCompleted: [task('t1', 'existing')] })] })
    const subset = form({
      projects: [project({ id: 'x', tasksCompleted: [task('t2', 'new')] })],
    })
    add(current, subset)
    expect(current.projects[0].tasksCompleted).toHaveLength(1)
    expect(subset.projects[0].tasksCompleted).toHaveLength(1)
  })
})
