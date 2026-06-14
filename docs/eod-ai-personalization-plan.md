# EOD AI Personalization — Implementation Plan

Builds on the shipped v3 pipeline (`eod-ai-implementation-plan.md`). Goal: user control over
what enters the EOD and how it's written — without a wall of toggles. Two primitives:
deterministic filters where guarantees matter, one natural-language instructions doc where
flexibility matters, plus per-run notes and post-generation refinement.

## Features

| # | Feature | Mechanism |
|---|---------|-----------|
| 1 | Project filter (allowlist/blocklist) | code-side filtering, auto-discovered project list |
| 2 | EOD Instructions doc | free text injected into both AI phases; ticket keys in it are auto-allowlisted |
| 3 | Today's notes | per-run textarea, injected as authoritative facts |
| 4 | Refine + promote-to-rule | write-phase-only rerun (~25s); refine text can be appended to the doc |
| 5 | Evidence view | render the fact sheet behind the draft |
| 6 | 04:00 day boundary | post-midnight work counts toward the previous day |

---

## Storage — `src/lib/eod-ai-settings.ts` (NEW)

Renderer-owned localStorage blob, passed to main per run (mirrors `eod-meetings-settings.ts` pattern):

```typescript
export interface EodAiSettings {
  filterMode: 'blocklist' | 'allowlist'
  excludedPaths: string[]    // active in blocklist mode
  includedPaths: string[]    // active in allowlist mode
  instructions: string       // the user's standing EOD instructions doc
}

const KEY = 'traccia:eod-ai-settings'
export function loadEodAiSettings(): EodAiSettings   // defaults: blocklist, [], [], ''
export function saveEodAiSettings(s: EodAiSettings): void
```

Default mode is **blocklist** (works with zero setup); privacy-minded users flip to
**allowlist** (fail-safe: unknown projects never leak). The known-projects list itself is
not persisted in renderer settings — it comes from main (see `eod:ai-list-projects`), which
already accumulates `eodAiKnownRepos` in electron-store.

**Filter matching:** case-insensitive path-prefix match on Windows (`C:\repos\aton` excludes
`C:\repos\aton\subdir` sessions too). Applied to session digests (`cwd`) AND git repos.
Excluded content is removed in the main process *before any prompt is built* — a hard
guarantee, not a model instruction.

---

## Type changes — `src/lib/eod-ai-types.ts`

```typescript
export interface EodAiGeneratePayload {
  pastEods: Array<{ date: string; plainText: string }>
  meetings: Array<{ title: string; durationMin: number }>
  notes: string                              // NEW — today's notes, may be ''
  filterMode: 'blocklist' | 'allowlist'      // NEW
  filterPaths: string[]                      // NEW — paths for the active mode
  instructions: string                       // NEW — the instructions doc
}

export interface EodAiDoneEvent {
  requestId: string
  draft: EodAiDraft
  dropped: string[]
  durationMs: number
  factSheet: EodFactSheet                    // NEW — for evidence view + refine
  seenProjects: string[]                     // NEW — cwds digested this run (pre-filter), feeds the checklist
}

export interface EodAiRefinePayload {        // NEW
  factSheet: EodFactSheet
  previousDraft: EodAiDraft
  instruction: string                        // e.g. "make bullet 2 vaguer"
  pastEods: Array<{ date: string; plainText: string }>
  instructions: string
}

export interface EodAiProjectInfo {          // NEW — for the settings checklist
  path: string
  sessionsToday: number                      // 0 for historically-known repos
}
```

---

## Main process changes

### `electron/eod-session-digest.ts`
- **04:00 boundary:** replace the `todayLocal` calendar-date comparison with an explicit
  window: `dayStart` = today 04:00 (or yesterday 04:00 if now < 04:00), `keep` if
  `dayStart <= timestamp <= now`. The mtime pre-filter floor becomes `dayStart - 2h`.
- Export `effectiveDayStart(now): Date` so git evidence uses the identical boundary.
- No filtering here — digest stays a pure scanner; the orchestrator filters (it needs the
  unfiltered cwd list for `seenProjects` discovery anyway).

### `electron/eod-git-evidence.ts`
- `gatherGitEvidence(repoPaths, sinceIso: string)` — replace `--since=midnight` with
  `--since=<sinceIso>` from `effectiveDayStart`.

### `electron/eod-ai-prompt.ts`
- `extractDeclaredKeys(text): string[]` — regex ticket keys out of instructions + notes.
- `buildGatherPrompt`: two new sections.
  - `EVIDENCE E — USER-DECLARED (authoritative)`: today's notes verbatim. Rule: facts the
    user states here are evidence with `source: "user"` — include them as tickets/actions
    even with no other trace; obey removals ("skip the morning meeting") by omitting from
    the fact sheet.
  - `USER STANDING INSTRUCTIONS`: the doc verbatim. Rule: standing declarations (e.g.
    "always include ATON-5555 as WIP regression testing") become fact-sheet entries with
    `source: "user"`; style-only rules are for the writing phase and can be ignored here.
- `buildWritePrompt`: new `USER RULES (override all defaults below)` section containing the
  instructions doc + today's notes. Placed above the format rules so user preferences win.
- `buildRefinePrompt(ctx)` (NEW): write prompt + `PREVIOUS DRAFT` (JSON) +
  `REFINEMENT REQUEST — apply exactly this change; keep everything else identical`.

### `electron/eod-ai-verify.ts`
- `verifyDraft(parsed, factSheet, extraAllowedKeys: string[])` — allowed set becomes
  fact-sheet keys ∪ user-declared keys. A ticket the user declared in instructions/notes can
  never be dropped as a hallucination (user declaration = evidence by definition).

### `electron/ipc.ts`
- `eod:ai-generate`: sanitize the new payload fields; after digest, compute
  `seenProjects` (distinct cwds), apply the filter to digests + repo paths, extract declared
  keys, thread `instructions`/`notes` into prompt builders, pass declared keys to
  `verifyDraft`, include `factSheet` + `seenProjects` in `eod:ai-done`.
- `eod:ai-refine` (NEW handler): payload-sanitize → `buildRefinePrompt` →
  `claude.generate` (120s timeout, fresh requestId, same single-active-run guard) →
  `verifyDraft` against the *echoed* fact sheet + declared keys → `eod:ai-done` (same
  channel; renderer treats it identically). No digest, no gather — ~25s.
- `eod:ai-list-projects` (NEW handler): fast (~200ms) — run `digestTodaySessions()`, merge
  today's cwds with the persisted `eodAiKnownRepos`, return `EodAiProjectInfo[]`. Lets the
  settings checklist populate *before* the first generation of the day.

### `electron/preload.cts` + `src/lib/types.ts`
- `eodAiRefine(payload)`, `eodAiListProjects()` — two new invokes following existing patterns.

---

## Dialog changes — `src/components/eod/eod-ai-dialog.tsx`

Two views inside the same dialog, toggled by a gear icon in the header: **Main** and
**Personalize**.

**Main view, idle state** (top to bottom):
- Existing explainer + source line.
- `Today's notes` textarea (optional, placeholder: *"Anything to add or change about today?
  e.g. 'Also tested payment flow with Ramesh — include as Done' or 'Skip the 1:1 meeting'"*).
  Cleared after a successful send-worthy generation? No — kept until dialog closes (so
  Regenerate reuses it); cleared next day.
- Generate button (unchanged behavior, payload now carries notes + settings).

**Personalize view:**
- Filter mode radio: `Report all projects except…` (blocklist) / `Only report these
  projects…` (allowlist).
- Project checklist from `eodAiListProjects()` (basename bold, full path muted, "today"
  badge when `sessionsToday > 0`). Checked = excluded (blocklist) or included (allowlist).
  Hint when empty: *"Projects appear here once Traccia sees your Claude sessions."*
- `EOD Instructions` textarea with 3 example placeholder lines (*"Keep sub-bullets short and
  non-technical"*, *"Always include ATON-5555 - regression testing as WIP"*, *"Never mention
  the Traccia project"*).
- Saved on change (debounced) to localStorage.

**Done state additions:**
- `Show evidence` toggle above the preview → replaces the iframe with a readable fact-sheet
  list: per ticket — key, title, status + statusEvidence, actions with source badges
  (session / git / jira / bitbucket / user); then meetings and unmatched work.
- Refine bar at the bottom of the preview: single-line input (*"Tweak it: e.g. 'make the
  second bullet vaguer', 'drop the meeting'"*) + Apply button → `eodAiRefine` with the kept
  fact sheet → running state shows only the "Writing your EOD" step → done state re-renders.
- After a successful refine: small inline chip *"Make this a standing rule"* → appends
  `- <instruction>` to `settings.instructions`, saves, toast confirms.

State to keep across refine: `factSheet`, `lastDraft`, `lastRefineInstruction`.

---

## Edge cases

| Case | Handling |
|------|----------|
| Allowlist mode, nothing matches | fail with 'no-evidence' + message suggesting checking the filter |
| All sessions filtered out but git/meetings remain | proceed — gather prompt already handles missing sessions |
| Instructions declare a ticket, Jira knows nothing about it | gather creates a `source: "user"` ticket; verify allows it via declared keys |
| Notes contradict evidence ("don't mention X") | gather instructed: user statements are authoritative, omit X |
| Refine asks for a brand-new ticket | not in fact sheet or declared keys → verifier drops it; evidence view + dropped notice explain why; user adds it to notes/instructions instead |
| Refine while another run active | single-active-run guard cancels the previous request (existing behavior) |
| Huge instructions doc | cap at 4,000 chars at sanitize time (log truncation) |
| 03:30 session | 04:00 boundary → counts toward yesterday, excluded today |

---

## Build order

1. `eod-ai-settings.ts` + types extensions
2. Digest 04:00 boundary + git `since` param
3. Prompt builders (instructions/notes sections, declared keys, refine prompt)
4. `verifyDraft` extra allowed keys
5. ipc: extended generate, `eod:ai-refine`, `eod:ai-list-projects`
6. preload + renderer types
7. Dialog: notes box, personalize view, evidence view, refine bar, promote-to-rule
8. Verify: unit harness (filter modes, key extraction, refine verify), build, lint, E2E with
   instructions that exclude a project + declare a ticket, then a refine run

## Acceptance

- A project checked off in blocklist mode never appears in any prompt or output (verified by
  inspecting the built prompt in the unit harness).
- A ticket declared only in instructions appears in the draft and survives verification.
- "Make bullet vaguer" refine returns in <40s changing only that bullet.
- Promote-to-rule round-trips: appended rule visibly changes the next day's generation.
