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

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const STATUS_BG: Record<ProjectStatus, string | null> = {
  green: 'rgb(0, 255, 0)',
  yellow: 'rgb(255, 255, 0)',
  red: 'rgb(255,0,0)',
  none: null,
}

function tasksHtml(tasks: EodTask[]): string {
  const filled = tasks.filter(t => t.text.trim())
  if (!filled.length) return `<ul style="margin:0 0 8px;padding-left:24px"><li>N/A</li></ul>`
  const items = filled.map(t => {
    const filledSubs = t.subBullets.filter(s => s.text.trim())
    const subs = filledSubs.length
      ? `<ul style="margin:2px 0 0;padding-left:20px;list-style-type:circle">${filledSubs.map(s => `<li>${esc(s.text)}</li>`).join('')}</ul>`
      : ''
    return `<li style="margin-bottom:4px">${esc(t.text)}${subs}</li>`
  }).join('')
  return `<ul style="margin:0 0 8px;padding-left:24px">${items}</ul>`
}

function sectionHtml(title: string, s: EodSimpleSection): string {
  const filled = s.items.filter(i => i.text.trim())
  const body = (s.isNA || !filled.length)
    ? `<ul style="margin:0 0 8px;padding-left:24px"><li>N/A</li></ul>`
    : `<ul style="margin:0 0 8px;padding-left:24px">${filled.map(i => `<li style="margin-bottom:4px">${esc(i.text)}</li>`).join('')}</ul>`
  return `<p style="margin:12px 0 4px"><strong>${title}:</strong></p>${body}`
}

export function buildEodHtml(form: EodFormState, settings: EodEmailSettings): string {
  const font = 'font-family:Aptos,Calibri,Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6'
  const bgColor = STATUS_BG[form.projectStatus]
  const projectDisplay = form.project ? esc(form.project) : 'N/A'
  const projectSpan = bgColor
    ? `<span style="background-color:${bgColor}">${projectDisplay}</span>`
    : projectDisplay
  const embedSig = settings.embedSignature !== false
  const sig = embedSig && settings.signature
    ? `<br><div style="${font};margin:0;line-height:1.5">${flattenSignatureToBreaks(settings.signature)}</div>`
    : ''
  return [
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head>`,
    `<body style="margin:0;padding:20px;background:#fff">`,
    `<div style="${font};max-width:600px">`,
    `<p style="margin:0 0 16px">Hello All,<br>Please find my EOD below.</p>`,
    `<p style="margin:0 0 8px"><strong>Project:</strong> ${projectSpan}</p>`,
    `<p style="margin:12px 0 4px"><strong>Tasks Completed:</strong></p>`,
    tasksHtml(form.tasksCompleted),
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
  const parts = [
    'Hello All,',
    'Please find my EOD below.',
    '',
    'Project:',
    `  ${form.project || 'N/A'}`,
    '',
    'Tasks Completed:',
    tasksText(form.tasksCompleted),
    '',
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
  function tasksList(tasks: EodTask[]): string {
    const filled = tasks.filter(t => t.text.trim())
    if (!filled.length) return '<ul><li>N/A</li></ul>'
    return `<ul>${filled.map(t => {
      const filledSubs = t.subBullets.filter(s => s.text.trim())
      const subs = filledSubs.length
        ? `<ul>${filledSubs.map(s => `<li>${esc(s.text)}</li>`).join('')}</ul>`
        : ''
      return `<li>${esc(t.text)}${subs}</li>`
    }).join('')}</ul>`
  }
  function simpleSection(title: string, s: EodSimpleSection): string {
    const filled = s.items.filter(i => i.text.trim())
    const body = (s.isNA || !filled.length)
      ? '<ul><li>N/A</li></ul>'
      : `<ul>${filled.map(i => `<li>${esc(i.text)}</li>`).join('')}</ul>`
    return `<p><strong>${title}:</strong></p>${body}`
  }
  return [
    '<p>Hello All,<br>Please find my EOD below.</p>',
    `<p><strong>Project:</strong> ${esc(form.project) || 'N/A'}</p>`,
    '<p><strong>Tasks Completed:</strong></p>',
    tasksList(form.tasksCompleted),
    simpleSection('Other (non-project related) Tasks', form.otherTasks),
    simpleSection('Concerns', form.concerns),
    simpleSection('Plan for the next working day', form.nextDayPlan),
    simpleSection('Upcoming Holidays planned', form.upcomingHolidays),
  ].join('')
}
