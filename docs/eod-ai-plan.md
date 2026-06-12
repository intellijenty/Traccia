# EOD AI Generation — Implementation Plan

## Overview

Build an "AI Generate EOD" feature in Traccia that spawns an agentic `claude -p` subprocess, provides it structured context and tool access, and uses its output to auto-fill the existing EOD form. No new credentials required — rides on Claude Code's existing Atlassian MCP and Bitbucket token.

See `eod-ai-requirements.md` for the full product requirements and vision.

---

## Architecture

```
User clicks "AI Generate"
        │
        ▼
[Renderer] reads localStorage EOD history
        │  ipcRenderer.invoke('eod:ai-generate', { pastEods, meetings, userEmail })
        ▼
[Main Process] eod-context-gatherer.ts
  ├── Scans ~/.claude/projects/*/ for .jsonl files modified today
  ├── Formats past EODs as plain text
  ├── Formats meetings list
  └── Builds context object
        │
        ▼
[Main Process] eod-ai-prompt.ts
  └── Builds full prompt string from context
        │
        ▼
[Main Process] claude-service.ts (existing)
  └── Spawns: claude -p --output-format stream-json
              --permission-mode dontAsk
              [prompt written to stdin]
        │
        ▼ (streams chunks back via ai:chunk IPC events)
[Agentic Claude subprocess]
  ├── Read tool → reads session .jsonl files
  ├── Atlassian MCP → searchJiraIssuesUsingJql (updated today)
  ├── Bitbucket → PRs opened/reviewed today
  └── Outputs JSON matching EodFormState schema
        │
        ▼
[Main Process] parses JSON result
        │  event.sender.send('eod:ai-done', { formState })
        ▼
[Renderer] auto-fills EodFormState → updates form
```

---

## New Files

### `electron/eod-context-gatherer.ts`

**Responsibility:** Gather all non-Claude context and return structured data + session file paths.

```typescript
export type EodGenerationContext = {
  userEmail: string
  userName: string
  todayDate: string           // YYYY-MM-DD
  pastEods: string            // plain text, last 3-5 EODs concatenated
  meetingsToday: string[]     // ["Aton daily (30min)", "PI Planning (60min)"]
  sessionFilePaths: string[]  // absolute paths of .jsonl files modified today
}

export async function gatherEodContext(
  pastEods: EodHistoryEntry[],  // passed from renderer
  meetings: MeetingEntry[],
  userEmail: string,
  userName: string,
): Promise<EodGenerationContext>
```

**Session file scanning:**
- Base path: `path.join(homedir(), '.claude', 'projects')`
- Walk all subdirs, find `*.jsonl` files
- Filter: `fs.stat(file).mtimeMs >= startOfTodayMs`
- Return paths only — Claude reads them agentically

**Past EOD formatting:**
- Take last 5 entries from history
- Strip HTML, use plain text body
- Include date header for each
- Cap total at ~4000 chars to avoid prompt bloat

---

### `electron/eod-ai-prompt.ts`

**Responsibility:** Build the complete prompt string handed to Claude.

```typescript
export function buildEodPrompt(ctx: EodGenerationContext): string
```

**Prompt structure:**

```
You are generating an EOD (End of Day) status email for {{userName}} ({{userEmail}}),
a software engineer at Roima Intelligence.

Your task: analyze the provided context sources and produce an EOD in EXACTLY
the format shown in the past EOD examples below.

━━━ FORMAT RULES ━━━
- Task line format: "PROJ-KEY - [exact ticket title] → WIP | Done"
- Sub-bullets: past tense, 3–10 words, management-friendly (not code-level)
- Meetings: "Attended meeting: [meeting name]"
- Status rules:
  • Done = PR was opened OR session shows completion/testing
  • WIP  = still investigating, implementing, or no PR yet
- Use N/A for empty sections, never leave blank
- Output ONLY valid JSON — no preamble, no explanation

━━━ OUTPUT JSON SCHEMA ━━━
{
  "projects": [{
    "name": "ATON",
    "status": "green",
    "statusNote": null,
    "tasksCompleted": [{
      "text": "ATON-7632 - [title] → WIP",
      "subBullets": [{ "text": "..." }]
    }]
  }],
  "otherTasks": { "items": [{ "text": "..." }], "isNA": false },
  "concerns": { "items": [], "isNA": true },
  "nextDayPlan": { "items": [{ "text": "Working on ticket ATON-XXXX" }], "isNA": false },
  "upcomingHolidays": { "items": [], "isNA": true }
}

━━━ PAST EODs (style guide + ticket title index) ━━━
{{pastEods}}

━━━ TODAY: {{todayDate}} ━━━

━━━ MEETINGS TODAY ━━━
{{meetingsList}}

━━━ STEP-BY-STEP INSTRUCTIONS ━━━
1. Read the following Claude Code session files (they document what was worked on today):
{{sessionFilePaths}}

2. Use Atlassian MCP — search Jira:
   JQL: assignee = currentUser() AND updated >= startOfDay() ORDER BY updated DESC
   Get: issue keys, exact titles, current status, any comments added today

3. Use Bitbucket — find PRs where you are author or reviewer, updated today
   A PR opened today = strong "Done" signal for that ticket

4. Cross-reference all sources:
   - Sessions tell you WHAT was done in detail (sub-bullets)
   - Jira tells you WHICH tickets and official titles
   - Bitbucket confirms completion status
   - Past EODs show the exact style and any previously seen ticket titles

5. Output the JSON. Nothing else.
```

---

## Modified Files

### `electron/ipc.ts`

Add one handler in the "EOD" section:

```typescript
ipcMain.handle('eod:ai-generate', async (event, payload: {
  pastEods: EodHistoryEntry[]
  meetings: Array<{ title: string; duration: number }>
  userEmail: string
  userName: string
}) => {
  const ctx = await gatherEodContext(
    payload.pastEods,
    payload.meetings,
    payload.userEmail,
    payload.userName,
  )
  const prompt = buildEodPrompt(ctx)
  const requestId = randomUUID()

  // Stream back progress chunks
  void claude.stream(
    { prompt, requestId, timeoutMs: 180_000 },
    { onChunk: (chunk) => event.sender.send('eod:ai-chunk', { chunk }) }
  ).then((result) => {
    if (result.ok) {
      event.sender.send('eod:ai-done', { raw: result.text })
    } else {
      event.sender.send('eod:ai-error', { error: result.error, code: result.code })
    }
  })

  return { requestId }
})

ipcMain.handle('eod:ai-cancel', (_event, requestId: string) => {
  claude.cancel(requestId)
})
```

---

### `electron/preload.cts`

Add under `// ── EOD Draft ──`:

```typescript
eodAiGenerate: (payload: {
  pastEods: unknown[]
  meetings: Array<{ title: string; duration: number }>
  userEmail: string
  userName: string
}): Promise<{ requestId: string }> =>
  ipcRenderer.invoke('eod:ai-generate', payload),

eodAiCancel: (requestId: string): void => {
  void ipcRenderer.invoke('eod:ai-cancel', requestId)
},

onEodAiChunk: (cb: (data: { chunk: string }) => void) => {
  const fn = (_: unknown, data: { chunk: string }) => cb(data)
  ipcRenderer.on('eod:ai-chunk', fn)
  return () => ipcRenderer.removeListener('eod:ai-chunk', fn)
},

onEodAiDone: (cb: (data: { raw: string }) => void) => {
  const fn = (_: unknown, data: { raw: string }) => cb(data)
  ipcRenderer.on('eod:ai-done', fn)
  return () => ipcRenderer.removeListener('eod:ai-done', fn)
},

onEodAiError: (cb: (data: { error: string; code: string }) => void) => {
  const fn = (_: unknown, data: { error: string; code: string }) => cb(data)
  ipcRenderer.on('eod:ai-error', fn)
  return () => ipcRenderer.removeListener('eod:ai-error', fn)
},
```

---

### `src/pages/eod-page.tsx`

**UI changes:**
- Add "AI Generate" button next to existing form controls
- Loading state: spinner + live status text fed from streaming chunks
- On success: parse JSON → call `setFormState()` → form auto-fills
- On error: toast with error message

**Status messages during generation** (derived from streaming chunks):
- "Reading your Claude sessions..."
- "Querying Jira..."
- "Checking Bitbucket..."
- "Writing your EOD..."

These are shown as Claude's tool-use events stream back. Parse chunk text for keywords (`searchJiraIssues`, `Read`, Bitbucket) to determine which phase is active.

**JSON parsing:**
```typescript
function parseEodJson(raw: string): EodFormState | null {
  // Extract JSON from Claude's output (may have surrounding text)
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    return mapToEodFormState(parsed)  // add makeId() to each item
  } catch {
    return null
  }
}
```

---

## Key Configuration

### claude-service.ts — No changes needed

The existing service handles everything. Key parameters for EOD generation:
- `timeoutMs: 180_000` — agentic loop needs up to 3 minutes
- `--permission-mode dontAsk` — auto-approves all tool uses (Read, MCP calls)
- No `--allowedTools` restriction — Claude needs Read + all configured MCPs

### Session File Scope

Scan ALL project subdirs under `~/.claude/projects/`, not just the Traccia project. The user may have worked on ATON in a separate project directory. Filter by `mtime` not by path.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No sessions found today | Proceed without session context, note in prompt |
| Jira MCP unavailable | Claude skips that step, generates from sessions only |
| Bitbucket unavailable | Claude skips, WIP/Done inferred from sessions |
| Claude not installed | Show "Claude Code not available" error before starting |
| Timeout (3 min) | Show timeout error, partial result if any text accumulated |
| JSON parse failure | Show raw text in a dialog for manual copy instead of form-fill |
| User cancels | `eodAiCancel(requestId)` → `taskkill` the subprocess |

---

## File Summary

| File | Action |
|------|--------|
| `electron/eod-context-gatherer.ts` | **New** — session file scanning, context assembly |
| `electron/eod-ai-prompt.ts` | **New** — prompt builder |
| `electron/ipc.ts` | **Modify** — add `eod:ai-generate` + `eod:ai-cancel` handlers |
| `electron/preload.cts` | **Modify** — expose 5 new API methods |
| `src/pages/eod-page.tsx` | **Modify** — AI button, loading state, form auto-fill |
| `electron/claude-service.ts` | **No change** — already supports everything needed |
| `electron/main.ts` | **No change** |

---

## Open Questions / Future Enhancements

- **Multi-project support:** Users on multiple Jira projects (not just ATON) — prompt already handles this generically via `searchJiraIssuesUsingJql` without project filter
- **Regenerate:** Button to re-run generation without clearing manually entered data
- **Source indicators:** Show "Generated from: Sessions ✓ Jira ✓ Bitbucket ✓" after completion
- **Edit before fill:** Show raw generated text for review before applying to form
