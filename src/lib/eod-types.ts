export type ProjectStatus = 'green' | 'yellow' | 'red' | 'none'

export interface EodSubBullet {
  id: string
  text: string
}

export interface EodTask {
  id: string
  text: string
  subBullets: EodSubBullet[]
}

export interface EodProject {
  id: string
  name: string
  status: ProjectStatus
  statusNote: string | null  // null = N/A; shown in email below project name when set
  tasksCompleted: EodTask[]
}

export interface EodSimpleSection {
  items: { id: string; text: string }[]
  isNA: boolean
}

export interface EodFormState {
  date: string
  projects: EodProject[]
  otherTasks: EodSimpleSection
  concerns: EodSimpleSection
  nextDayPlan: EodSimpleSection
  upcomingHolidays: EodSimpleSection
}

export interface EodEmailSettings {
  to: string
  cc: string[]
  signature: string      // stores HTML
  embedSignature: boolean
}

export interface EodHistoryEntry {
  date: string
  subject: string
  mode: 'form' | 'editor'
  htmlBody: string
  plainText: string
  formState?: EodFormState
  sentAt: string
}

export function makeId(): string {
  return Math.random().toString(36).slice(2, 11)
}

export function makeEmptyTask(): EodTask {
  return { id: makeId(), text: '', subBullets: [] }
}

export function makeEmptySimpleSection(defaultNA = true): EodSimpleSection {
  return { items: [], isNA: defaultNA }
}

export function makeEmptyProject(name = ''): EodProject {
  return { id: makeId(), name, status: 'green', statusNote: null, tasksCompleted: [] }
}

export function makeDefaultFormState(): EodFormState {
  return {
    date: new Date().toLocaleDateString('en-CA'),
    projects: [makeEmptyProject()],
    otherTasks: makeEmptySimpleSection(true),
    concerns: makeEmptySimpleSection(true),
    nextDayPlan: makeEmptySimpleSection(false),
    upcomingHolidays: makeEmptySimpleSection(true),
  }
}
