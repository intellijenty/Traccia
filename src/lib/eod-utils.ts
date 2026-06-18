import type { EodFormState, EodTask, EodSimpleSection, EodEmailSettings, ProjectStatus } from './eod-types'

// Converts TipTap <p> paragraphs to <br>-separated inline content.
// Outlook's Word renderer ignores CSS margins on <p> tags and adds its own
// paragraph spacing (~8pt), making signatures look double-spaced. <br> has no
// such issue — it just moves to the next line with no extra gap.
export function flattenSignatureToBreaks(html: string): string {
  return html
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, inner) => inner ? inner + '<br>' : '')
    .replace(/(<br\s*\/?>\s*)+$/gi, '')
    .trim()
}

export function migratePlainTextSignature(sig: string): string {
  if (!sig || /<[a-z][\s\S]*>/i.test(sig)) return sig
  return `<p>${sig.replace(/\n/g, '<br>')}</p>`
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

export function resolveEmail(raw: string, orgDomain: string): string {
  const trimmed = raw.trim().toLowerCase()
  if (orgDomain && !trimmed.includes('@') && trimmed.length > 0) {
    return `${trimmed}@${orgDomain}`
  }
  return trimmed
}

export function formatEodDate(date: string, sep: '/' | '-' = '-'): string {
  const [year, month, day] = date.split('-')
  return `${day}${sep}${month}${sep}${year}`
}

export function buildEodSubject(date: string, sep: '/' | '-' = '-'): string {
  return `EOD: ${formatEodDate(date, sep)}`
}

export function detectDateSeparator(subject: string): '/' | '-' {
  const m = subject.match(/EOD:\s*\d{2}([/-])\d{2}/)
  return m?.[1] === '/' ? '/' : '-'
}

// Roll an auto-generated subject ("EOD: DD-MM-YYYY", '/' or '-') forward to
// `today` (YYYY-MM-DD) when its encoded date is stale.
//
// The decision is made PURELY from the subject's own encoded date — never from
// formState.date. formState.date is force-advanced to today by several paths
// (draft load on remount, AI inject, open-in-Outlook midnight correction) that
// don't touch the subject; keying the regen off it lets the two desync, which
// freezes the subject at yesterday while the heading shows today.
// A subject that isn't in the exact auto format is treated as a manual edit and
// left untouched.
export function refreshAutoSubject(subject: string, today: string): string {
  const m = subject.match(/^EOD:\s*(\d{2})([/-])(\d{2})\2(\d{4})$/)
  if (!m) return subject
  const [, dd, sep, mm, yyyy] = m
  const encoded = `${yyyy}-${mm}-${dd}`
  if (encoded === today) return subject
  return buildEodSubject(today, sep as '/' | '-')
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const STATUS_BG: Record<ProjectStatus, string | null> = {
  green: 'rgb(0, 255, 0)',
  yellow: 'rgb(255, 255, 0)',
  red: 'rgb(255,0,0)',
  none: null,
}

// Outlook's Word renderer often drops list-style-type set on <ul> only —
// it must also be set on each <li>. The ul-level rule keeps non-Outlook
// clients happy; the per-li rule covers Outlook.
// margin:0 kills consecutive-bullet gap; line-height tightens row height
// (overrides body's 1.6). mso-* hints suppress Word renderer's auto-spacing.
const LI_BASE = 'margin:0;line-height:1.35;mso-margin-top-alt:0;mso-margin-bottom-alt:0'

function subsHtml(subs: { id: string; text: string }[]): string {
  const filled = subs.filter(s => s.text.trim())
  if (!filled.length) return ''
  const items = filled.map(s =>
    `<li style="${LI_BASE};list-style-type:square">${esc(s.text)}</li>`
  ).join('')
  return `<ul style="margin:0;padding-left:40px;list-style-type:square">${items}</ul>`
}

function tasksHtml(tasks: EodTask[]): string {
  const filled = tasks.filter(t => t.text.trim())
  const inner = !filled.length
    ? `<li style="${LI_BASE};list-style-type:disc">N/A</li>`
    : filled.map(t =>
        `<li style="${LI_BASE};list-style-type:disc">${esc(t.text)}${subsHtml(t.subBullets)}</li>`
      ).join('')
  return `<ul style="margin:0;padding-left:40px;list-style-type:disc">${inner}</ul>`
}

// Wraps the "Tasks Completed:" heading itself as a bulleted item (level 1),
// with the task list nested beneath as level 2. Matches template nesting.
function tasksCompletedBlock(tasks: EodTask[]): string {
  return [
    `<ul style="margin:0 0 4px;padding-left:40px;list-style-type:disc">`,
    `<li style="${LI_BASE};list-style-type:disc"><strong>Tasks Completed:</strong>`,
    tasksHtml(tasks),
    `</li>`,
    `</ul>`,
  ].join('')
}

function sectionHtml(title: string, s: EodSimpleSection): string {
  const filled = s.items.filter(i => i.text.trim())
  const items = (s.isNA || !filled.length)
    ? `<li style="${LI_BASE};list-style-type:disc">N/A</li>`
    : filled.map(i =>
        `<li style="${LI_BASE};list-style-type:disc">${esc(i.text)}</li>`
      ).join('')
  return [
    `<p style="margin:14px 0 0"><strong>${title}:</strong></p>`,
    `<ul style="margin:0 0 4px;padding-left:40px;list-style-type:disc">${items}</ul>`,
  ].join('')
}

export function buildEodHtml(form: EodFormState, settings: EodEmailSettings): string {
  const font = 'font-family:Aptos,Calibri,Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6'
  const embedSig = settings.embedSignature !== false
  const sig = embedSig && settings.signature
    ? `<br><div style="${font};margin:0;line-height:1.5">${flattenSignatureToBreaks(settings.signature)}</div>`
    : ''

  const projectsHtml = form.projects.map(project => {
    const bgColor = STATUS_BG[project.status]
    const projectDisplay = project.name ? esc(project.name) : 'N/A'
    const projectSpan = bgColor
      ? `<span style="background-color:${bgColor}">${projectDisplay}</span>`
      : projectDisplay
    const statusNoteLine = project.statusNote?.trim()
      ? `<p style="margin:0 0 4px">${esc(project.statusNote.trim())}</p>`
      : ''
    return [
      `<p style="margin:14px 0 0"><strong>Project:</strong> ${projectSpan}</p>`,
      statusNoteLine,
      tasksCompletedBlock(project.tasksCompleted),
    ].join('')
  }).join('')

  return [
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head>`,
    `<body style="margin:0;padding:20px;background:#fff">`,
    `<div style="${font}">`,
    `<p style="margin:0 0 16px">Hello All,<br>Please find my EOD below.</p>`,
    projectsHtml,
    sectionHtml('Other (non-project related) Tasks', form.otherTasks),
    sectionHtml('Concerns', form.concerns),
    sectionHtml('Plan for the next working day', form.nextDayPlan),
    sectionHtml('Upcoming Holidays planned', form.upcomingHolidays),
    sig,
    `</div></body></html>`,
  ].join('')
}

function tasksText(tasks: EodTask[]): string {
  const filled = tasks.filter(t => t.text.trim())
  if (!filled.length) return '  - N/A'
  return filled.map(t => {
    const filledSubs = t.subBullets.filter(s => s.text.trim())
    const subs = filledSubs.map(s => `      - ${s.text}`).join('\n')
    return `  - ${t.text}${subs ? '\n' + subs : ''}`
  }).join('\n')
}

function sectionText(title: string, s: EodSimpleSection): string {
  const filled = s.items.filter(i => i.text.trim())
  const body = (s.isNA || !filled.length) ? '  - N/A' : filled.map(i => `  - ${i.text}`).join('\n')
  return `${title}:\n${body}`
}

export function buildEodPlainText(form: EodFormState, settings: EodEmailSettings): string {
  const projectParts = form.projects.flatMap(project => {
    const lines: string[] = [`Project:\n  ${project.name || 'N/A'}`]
    if (project.statusNote?.trim()) lines.push(`Status:\n  ${project.statusNote.trim()}`)
    lines.push('', 'Tasks Completed:', tasksText(project.tasksCompleted), '')
    return lines
  })

  const parts = [
    'Hello All,',
    'Please find my EOD below.',
    '',
    ...projectParts,
    sectionText('Other (non-project related) Tasks', form.otherTasks),
    '',
    sectionText('Concerns', form.concerns),
    '',
    sectionText('Plan for the next working day', form.nextDayPlan),
    '',
    sectionText('Upcoming Holidays planned', form.upcomingHolidays),
  ]
  const embedSig = settings.embedSignature !== false
  if (embedSig && settings.signature) {
    parts.push('', stripHtml(settings.signature))
  }
  return parts.join('\n')
}

export function buildEditorHtml(form: EodFormState): string {
  // Mirrors buildEodHtml nesting so editor-mode sends match template formatting
  // when the user switches form → editor or restores from history. TipTap
  // preserves the ul/li tree on round-trip; inline styles may be stripped, so
  // structure carries the formatting, not CSS.
  function subsList(subs: { id: string; text: string }[]): string {
    const filled = subs.filter(s => s.text.trim())
    if (!filled.length) return ''
    return `<ul>${filled.map(s => `<li>${esc(s.text)}</li>`).join('')}</ul>`
  }
  function tasksList(tasks: EodTask[]): string {
    const filled = tasks.filter(t => t.text.trim())
    const items = !filled.length
      ? '<li>N/A</li>'
      : filled.map(t => `<li>${esc(t.text)}${subsList(t.subBullets)}</li>`).join('')
    return `<ul>${items}</ul>`
  }
  function tasksCompletedBlock(tasks: EodTask[]): string {
    return `<ul><li><strong>Tasks Completed:</strong>${tasksList(tasks)}</li></ul>`
  }
  function simpleSection(title: string, s: EodSimpleSection): string {
    const filled = s.items.filter(i => i.text.trim())
    const body = (s.isNA || !filled.length)
      ? '<ul><li>N/A</li></ul>'
      : `<ul>${filled.map(i => `<li>${esc(i.text)}</li>`).join('')}</ul>`
    return `<p><strong>${title}:</strong></p>${body}`
  }

  const projectBlocks = form.projects.map(project => {
    const statusNoteLine = project.statusNote?.trim()
      ? `<p>${esc(project.statusNote.trim())}</p>`
      : ''
    return [
      `<p><strong>Project:</strong> ${esc(project.name) || 'N/A'}</p>`,
      statusNoteLine,
      tasksCompletedBlock(project.tasksCompleted),
    ].join('')
  }).join('')

  return [
    '<p>Hello All,<br>Please find my EOD below.</p>',
    projectBlocks,
    simpleSection('Other (non-project related) Tasks', form.otherTasks),
    simpleSection('Concerns', form.concerns),
    simpleSection('Plan for the next working day', form.nextDayPlan),
    simpleSection('Upcoming Holidays planned', form.upcomingHolidays),
  ].join('')
}
