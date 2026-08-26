// JSON Schemas handed to `claude --json-schema` so both AI phases return
// structurally valid output at the API level instead of "please reply with only
// JSON" and a hand-rolled parser downstream.
//
// These mirror EodFactSheet / EodAiDraft in src/lib/eod-ai-types.ts. Keep them
// in sync — the coercion layer in eod-ai-verify.ts stays as a second line of
// defence (schema output still needs semantic verification), but it should no
// longer be the thing standing between the model and a parse failure.

const textItems = {
  type: 'array',
  items: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false,
  },
} as const

const simpleSection = {
  type: 'object',
  properties: { items: textItems, isNA: { type: 'boolean' } },
  required: ['items', 'isNA'],
  additionalProperties: false,
} as const

/** Gather phase output — evidence-tagged fact sheet. */
export const FACT_SHEET_SCHEMA = {
  type: 'object',
  properties: {
    tickets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          title: { type: 'string' },
          titleSource: { type: 'string', enum: ['jira', 'pastEod', 'branch-only'] },
          statusSignal: { type: 'string', enum: ['done', 'wip'] },
          statusEvidence: { type: 'string' },
          actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                source: { type: 'string', enum: ['session', 'git', 'jira', 'user'] },
              },
              required: ['text', 'source'],
              additionalProperties: false,
            },
          },
        },
        required: ['key', 'title', 'titleSource', 'statusSignal', 'statusEvidence', 'actions'],
        additionalProperties: false,
      },
    },
    unmatchedWork: { type: 'array', items: { type: 'string' } },
  },
  required: ['tickets', 'unmatchedWork'],
  additionalProperties: false,
} as const

/** Write / refine phase output — EodFormState minus ids and date. */
export const EOD_DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    projects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          status: { type: 'string', enum: ['green', 'yellow', 'red', 'none'] },
          statusNote: { type: ['string', 'null'] },
          tasksCompleted: {
            type: 'array',
            items: {
              type: 'object',
              properties: { text: { type: 'string' }, subBullets: textItems },
              required: ['text', 'subBullets'],
              additionalProperties: false,
            },
          },
        },
        required: ['name', 'status', 'statusNote', 'tasksCompleted'],
        additionalProperties: false,
      },
    },
    otherTasks: simpleSection,
    concerns: simpleSection,
    nextDayPlan: simpleSection,
    upcomingHolidays: simpleSection,
  },
  required: ['projects', 'otherTasks', 'concerns', 'nextDayPlan', 'upcomingHolidays'],
  additionalProperties: false,
} as const
