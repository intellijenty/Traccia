# EOD AI Generation — Implementation Plan (v3)

Supersedes `eod-ai-plan.md`. See `eod-ai-requirements.md` for product vision.

## Scope (locked with user)

- **Quality bar applies to project ticket tasks only** — ticket lines + sub-bullets must be precise. `Other Tasks`, `Concerns`, `Plan for next day` get simple best-effort fills (N/A is fine).
- **UI: standalone dialog, no form injection.** A dialog styled like `EodHistoryViewDialog` (recent drafts view): Generate button → live progress → rendered EOD preview + Copy. The existing EOD form is untouched.
- No new credentials. Rides on Claude Code subscription auth + user-scope Atlassian MCP + Bitbucket token already in the user's environment.

## Why not the v1 agent plan

The v1 plan handed Claude raw `.jsonl` session paths and told it to `Read` them. Real data: a workday is 6–22 session files, 4–16 MB, ~90% tool-result noise. The agent would burn its context on noise and produce vague sub-bullets. v3 pre-digests sessions deterministically in the main process and injects ~30–60 KB of pure signal instead.

## Architecture

```
[Renderer] EodAiDialog — "Generate" clicked
    │ reads localStorage: eod history (last 5), meetings today, email settings
    │ ipcRenderer.invoke('eod:ai-generate', { pastEods, meetings })
    ▼
[Main] eod-ai orchestrator (ipc.ts)
    │
    ├─ 1. DIGEST (deterministic, ~1s, no AI)
    │     eod-session-digest.ts  → per-session digests of today's work
    │     eod-git-evidence.ts    → commits/branches/uncommitted diffs across known repos
    │
    ├─ 2. GATHER (agentic claude -p, tools: Atlassian MCP + Bash for Bitbucket)
    │     input:  digests + git evidence + meetings + ticket-title index from past EODs
    │     output: FACT SHEET — evidence-tagged JSON of tickets, actions, status signals
    │     progress events streamed → 'eod:ai-phase'
    │
    ├─ 3. WRITE (plain claude -p, no tool use expected)
    │     input:  fact sheet + past 3–5 EODs verbatim (style fingerprint)
    │     output: EodFormState-shaped JSON
    │
    ├─ 4. VERIFY (deterministic TypeScript, no AI)
    │     drop any ticket key not present in the fact sheet
    │     validate JSON shape, fill defaults
    ▼
[Renderer] dialog maps JSON → EodFormState (makeId per item)
    renders via existing buildEodHtml() in an iframe (same as history dialog)
    footer: Copy (buildEodPlainText) · Regenerate · Close
```

Two AI phases instead of one because fact-gathering and style-mimicry interfere: a single pass drifts on one or the other. Phase 2 sees only clean facts + style examples, so the voice stays the user's.

---

## New file: `electron/eod-session-digest.ts`

Deterministic JSONL parser. No AI.

```typescript
export type SessionDigest = {
  project: string          // decoded from project dir name
  cwd: string              // from line cwd field (exact repo path)
  gitBranch: string | null // from line gitBranch field — often contains ticket key
  startedAt: string        // first today-message timestamp
  endedAt: string
  userPrompts: string[]    // what the user asked = what they worked on
  assistantSummaries: string[]  // assistant text blocks (truncated per block)
  filesTouched: string[]   // from tool_use inputs: file_path values, deduped
}

export function digestTodaySessions(): { digests: SessionDigest[]; repoPaths: string[] }
```

Rules — each one exists for a reason:

- **Scan** all `~/.claude/projects/*/*.jsonl` with `mtime >= startOfToday - 2h` (cheap pre-filter), then **filter individual lines by their `timestamp` field to today (local time)**. Files span days; mtime alone over/under-includes.
- **Keep:** `type: "user"` message text; `type: "assistant"` text blocks; `tool_use` blocks → tool name + `file_path`/`command` input only (never tool results).
- **Drop:** tool results, attachments, file-history-snapshots, thinking blocks, lines with `isSidechain: true` (subagent noise).
- **Skip self:** ignore sessions whose first user message contains the sentinel `[TRACCIA-EOD]` — our own generation runs land in `~/.claude/projects` too and would pollute tomorrow's digest. Both prompts below open with this sentinel.
- **Caps:** per assistant text block 600 chars; per session 8 000 chars (keep first and last messages when truncating — intent lives at the start, outcome at the end); total across sessions 60 000 chars. Log dropped counts.
- **Repo paths:** collect distinct `cwd` values → return as `repoPaths`. Also union them into a persisted `knownRepos` list in electron-store so repos worked on manually (no Claude session today) still get git-scanned.

## New file: `electron/eod-git-evidence.ts`

Deterministic. No AI.

```typescript
export type RepoEvidence = {
  repoPath: string
  branch: string                 // current branch — ticket keys live here
  commitsToday: string[]         // "a1b2c3 ATON-7632 fix quota race (14:32)"
  uncommitted: string | null     // git diff --stat summary, null if clean
}

export async function gatherGitEvidence(repoPaths: string[]): Promise<RepoEvidence[]>
```

Per repo (parallel, 5 s timeout each, skip on any failure):

- `git config user.email` → author filter (per-repo identity; no need to pass user email around)
- `git log --since=midnight --author=<email> --all --format=%h %s (%cr)`
- `git rev-parse --abbrev-ref HEAD`
- `git diff --stat` + `git diff --cached --stat` → uncommitted WIP signal (work with no commit and no session still shows up)

## New file: `electron/eod-ai-prompt.ts`

Two builders.

### `buildGatherPrompt(ctx): string` — phase 2 input

Opens with `[TRACCIA-EOD]` sentinel. Contains:

1. Session digests (formatted per session: project, branch, time range, prompts, summaries, files)
2. Git evidence per repo
3. Meetings today (pre-filtered list from renderer)
4. Ticket-title index extracted from past EODs (`ATON-7632 - …` lines only — not full EODs; style is phase 3's job)
5. Instructions:
   - Query Jira via Atlassian MCP: `assignee = currentUser() AND updated >= -1d ORDER BY updated DESC` — get exact keys, titles, statuses. Also look up by key any ticket seen in branches/digests but missing from JQL results.
   - Check Bitbucket via Bash + the configured token env var: PRs authored/updated today → strong "Done" signal. If the call fails, continue without it.
   - Cross-reference and output a **fact sheet** (JSON, schema below). Every action bullet must cite its evidence source: `session | git | jira | bitbucket | meeting`.
   - **Hard rule: never invent a ticket key or title. A key must appear in at least one evidence source. Unmatched work goes to `unmatchedWork`, not a guessed ticket.**

Fact sheet schema:

```json
{
  "tickets": [{
    "key": "ATON-7632",
    "title": "exact Jira title",
    "titleSource": "jira | pastEod | branch-only",
    "statusSignal": "done | wip",
    "statusEvidence": "PR #123 opened 16:40",
    "actions": [{ "text": "what was done", "source": "session" }]
  }],
  "meetings": ["Aton daily"],
  "unmatchedWork": ["work that maps to no ticket"]
}
```

### `buildWritePrompt(factSheet, pastEods): string` — phase 3 input

Opens with `[TRACCIA-EOD]` sentinel. Contains:

1. The fact sheet verbatim
2. Last 3–5 past EODs as plain text (style fingerprint: vocabulary, granularity, how many sub-bullets, how meetings are phrased)
3. Format rules from requirements (ticket line format, sub-bullets past tense 3–10 words management-friendly, N/A handling)
4. Output schema = `EodFormState` minus `id` fields and `date`:

```json
{
  "projects": [{
    "name": "ATON", "status": "green", "statusNote": null,
    "tasksCompleted": [{ "text": "ATON-7632 - [title] → WIP", "subBullets": [{ "text": "..." }] }]
  }],
  "otherTasks": { "items": [], "isNA": true },
  "concerns": { "items": [], "isNA": true },
  "nextDayPlan": { "items": [{ "text": "Working on ticket ATON-7632" }], "isNA": false },
  "upcomingHolidays": { "items": [], "isNA": true }
}
```

5. "Output ONLY the JSON object." Tool use neither needed nor expected in this phase.

Simple sections: meetings route per past-EOD precedent; `nextDayPlan` defaults to continuing WIP tickets; `concerns`/`upcomingHolidays` default N/A. No deep effort — out of scope.

## Modified: `electron/claude-service.ts`

**Found during verification:** the service's `buildArgs` was broken against current Claude CLI (v2.1.173) — `--no-color` was removed from the CLI (process exits immediately with `error: unknown option '--no-color'`), and `--output-format stream-json` in `-p` mode now *requires* `--verbose`. Fixed both; this also repairs the pre-existing generic `ai:generate`/`ai:stream` channels.

Also: on Windows the spawned agent uses a `PowerShell` tool rather than `Bash` — the orchestrator's phase mapper handles both.

One additive change — surface tool-use events for real progress (v1 plan grepped text chunks for keywords; stream-json already carries structured `tool_use` blocks in assistant messages):

```typescript
type StreamCallbacks = {
  onChunk: (chunk: string) => void
  onToolUse?: (toolName: string) => void   // NEW
}
```

In the assistant-message branch, also extract `content` blocks of `type: 'tool_use'` and emit `block.name`. Everything else (binary resolution, taskkill tree, timeout, stderr classification) already works.

## Modified: `electron/ipc.ts` — orchestrator

```typescript
ipcMain.handle('eod:ai-generate', async (event, payload: {
  pastEods: EodHistoryEntry[]
  meetings: Array<{ title: string; durationMin: number }>
}) => {
  const send = (ch: string, data: unknown) => { try { event.sender.send(ch, data) } catch {} }
  const requestId = randomUUID()

  void (async () => {
    // 1. deterministic evidence
    send('eod:ai-phase', { phase: 'sessions', label: 'Reading your Claude sessions...' })
    const { digests, repoPaths } = digestTodaySessions()
    const git = await gatherGitEvidence(repoPaths)

    // 2. gather facts (agentic)
    send('eod:ai-phase', { phase: 'gather', label: 'Cross-referencing Jira & Bitbucket...' })
    const gatherResult = await claude.stream(
      { prompt: buildGatherPrompt({ digests, git, meetings, pastEods }), requestId, timeoutMs: 240_000 },
      { onChunk: () => {}, onToolUse: (tool) => send('eod:ai-phase', phaseForTool(tool)) },
    )
    if (!gatherResult.ok) return send('eod:ai-error', gatherResult)
    const factSheet = extractJson(gatherResult.text)          // fenced-block-aware extraction
    if (!factSheet) return send('eod:ai-error', { error: 'Could not parse fact sheet', code: 'parse' })

    // 3. write in user's voice (plain)
    send('eod:ai-phase', { phase: 'write', label: 'Writing your EOD...' })
    const writeResult = await claude.generate(
      { prompt: buildWritePrompt(factSheet, payload.pastEods), requestId, timeoutMs: 120_000 })
    if (!writeResult.ok) return send('eod:ai-error', writeResult)
    const draft = extractJson(writeResult.text)
    if (!draft) return send('eod:ai-error', { error: 'Could not parse EOD draft', code: 'parse', raw: writeResult.text })

    // 4. deterministic verify
    const verified = verifyDraft(draft, factSheet)   // drop ticket keys absent from fact sheet; shape-check; defaults
    send('eod:ai-done', { draft: verified })
  })()

  return { requestId }
})
```

`phaseForTool`: name contains `atlassian`/`jira` → "Querying Jira..."; `Bash` → "Checking Bitbucket..."; else keep current phase. Cancel: existing `ai:cancel` channel works since both phases share `requestId` (cancel kills the active process; orchestrator bails on the failed result).

`verifyDraft` (pure function, unit-testable):
- Every `PROJ-123` key in `tasksCompleted` must exist in `factSheet.tickets` — else drop that task and log.
- Coerce shape: arrays exist, `isNA` consistent with empty items, strings trimmed, status one of the enum values.
- Returns the cleaned draft plus `{ dropped: string[] }` for the dialog to surface if non-empty.

## Modified: `electron/preload.cts`

Four additions following existing patterns: `eodAiGenerate(payload)`, `onEodAiPhase(cb)`, `onEodAiDone(cb)`, `onEodAiError(cb)` (each `on*` returns an unsubscribe, same as `onAiChunk`). Reuse existing `aiCancel(requestId)` and `aiAvailable()` — already exposed.

## New file: `src/components/eod/eod-ai-dialog.tsx`

Mirror `EodHistoryViewDialog` layout (md:max-w-4xl, 80vh, header / body / footer).

States:

1. **Idle** — body: short explanation + source list (Claude sessions · Git · Jira · Bitbucket · Meetings) + primary **Generate** button. If `aiAvailable()` fails → inline "Claude Code not found" with the resolved error, Generate disabled.
2. **Generating** — phase checklist driven by `eod:ai-phase` (`Reading sessions → Jira → Bitbucket → Writing`), elapsed timer, Cancel button (`aiCancel(requestId)`).
3. **Done** — map draft JSON → `EodFormState` (inject `makeId()` per project/task/bullet/item, `date` = today). Render `buildEodHtml(formState, emailSettings)` in a sandboxed iframe — pixel-identical to the recent-drafts preview. If `dropped` non-empty, small amber note "N unverifiable task(s) removed". Footer: **Copy** (`buildEodPlainText` → clipboard, toast), **Regenerate**, **Close**.
4. **Error** — message + code; if `code === 'parse'` show raw text in a `<pre>` for manual copy; Retry button.

Entry point in `eod-page.tsx`: a "✦ AI Generate" button near the Recent Drafts section toggling the dialog. Page passes `pastEods` (from existing `history` state, sorted desc, max 5) and today's meetings (existing meeting sync data, already filtered). No other page changes.

## Error handling

| Scenario | Behavior |
|---|---|
| Claude binary missing | Dialog idle state shows install hint; Generate disabled |
| No sessions today | Proceed — git + Jira + meetings may still carry the day; gather prompt notes the absence |
| Git command fails per repo | Skip repo silently (logged) |
| Atlassian MCP unavailable | Gather prompt: fall back to titles from past-EOD index, mark `titleSource: branch-only` |
| Bitbucket call fails | Status inferred from sessions/git only |
| Fact-sheet or draft JSON unparseable | Error state with raw text for manual copy |
| Rate-limited / timeout | Classified by existing `claude-service`; shown with code |
| Cancel | `aiCancel(requestId)` → taskkill tree; dialog returns to idle |

## Phase 2 (later, not in this build): style learning loop

After each real send, diff the AI draft (persist last generated draft per date in localStorage) against the sent EOD for the same date; a cheap `claude.generate` call extracts durable style rules ("merges minor fixes into one bullet", "Done only after PR approved") appended to a persisted style profile that `buildWritePrompt` includes. Converges toward send-as-is over weeks. Deferred — copy-paste flow makes the diff noisier; revisit once v3 quality is observed.

## Build order

1. `eod-session-digest.ts` + unit tests against real local JSONL fixtures
2. `eod-git-evidence.ts`
3. `claude-service.ts` `onToolUse` (additive)
4. `eod-ai-prompt.ts` (both builders) + `verifyDraft`
5. `ipc.ts` orchestrator + `preload.cts`
6. `eod-ai-dialog.tsx` + page button
7. End-to-end test on a real workday's data

## Acceptance check

Generate on a real workday → every ticket key real (exists in Jira or past EODs), titles exact, 2–5 sub-bullets per ticket each traceable to a session/git/PR fact, WIP/Done correct per PR evidence, output voice matches past EODs. Tickets section ready to send with at most minor edits.
