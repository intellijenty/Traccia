# EOD AI Generation — Requirements

## What Is This

An AI-powered EOD (End of Day) email generation feature built into Traccia, the internal time-tracking desktop app used by Roima Intelligence employees. The goal is to eliminate the daily friction of manually writing EOD status emails by having Claude intelligently reconstruct what the user worked on and write the email for them — in their exact personal style.

---

## The Problem

Every working day, each employee at Roima writes an EOD email to their tech lead and management (Product Owner, Tech lead, Solution Architect, PM, HRs). The email documents:
- Which Jira tickets were worked on and their status (WIP/Done)
- Specific actions taken within each ticket (sub-bullets)
- Meetings attended
- Concerns (if any)
- Plan for next day

Writing this manually takes 5–15 minutes and requires the employee to mentally reconstruct their entire workday. People forget things, write vaguely. The quality and detail of EODs varies significantly across the team.

---

## The Vision

One button in Traccia. Claude reads everything — your Claude Code sessions, Jira activity, Bitbucket PRs, and important context past EODs — and writes your EOD for you. Not a template filler. Not a form wizard. Actual human-like intelligence that understands what you did today and communicates it at the right level.

The output should be indistinguishable from something the user wrote manually on a good day — specific, accurate, appropriately non-technical, correctly structured.

---

## Who This Is For

**Primary users:** Software engineers (and other internal projects).

**Assumptions about users:**
- Each user has Claude Code (CLI) installed on their machine, logged in via company subscription
- Each user has the Atlassian (Jira) MCP connected in their Claude Code / Claude Desktop config
- Each user has a Bitbucket token configured in their Claude Code environment
- Users already use Traccia daily for time tracking and EOD email sending
- Users already have past EODs stored in Traccia's history (localStorage)

**No per-user API token setup required.** The feature rides entirely on Claude Code's existing credential infrastructure.

---

## What "Good Output" Looks Like

Based on real EOD examples, the expected output format is:

```
Project: ATON

Tasks Completed:
• ATON-7632 - There shall be a method of how to interpret and measure Aton AI quota usage → WIP
  ◦ Analysed existing AI cost and quota flow end-to-end
  ◦ Added configurable pricing formula per agent
  ◦ Fixed race condition on quota updates
  ◦ Debug the quota usage calculation when user has restricted permissions

• ATON-6229 - IA - table Ready (OK) column → Done
  ◦ Tested the changes and made a PR

• Attended meeting: Aton daily

Other Tasks:
• N/A

Concerns:
• N/A

Plan for next working day:
• Working on ticket ATON-7632
```

**Key style rules Claude must follow:**
- Ticket line: `PROJ-KEY - [exact Jira ticket title] → WIP | Done`
- Sub-bullets: past tense, 3–10 words, management-friendly (not implementation-level detail)
- Status inference: "Done" if PR was made or session shows completion; "WIP" if still investigating/implementing
- Meetings listed under Tasks Completed if project-related, under Other Tasks if not
- N/A for empty sections — never leave them blank

---

## The Four Context Sources

### 1. Claude Code Session Transcripts (Very Important context source)
**What:** JSONL files at `~/.claude/projects/*/` — every conversation the user had with Claude today across all projects.

**Why it's the most valuable source:** Sessions contain the actual work evidence. When a user was fixing a bug, the session transcript literally describes the bug, the investigation, the solution. This is the source of sub-bullet precision — "Fixed ghost 'pending changes' indicator appearing after toggling Ready on/off" comes from reading the session that worked on it.

**How Claude uses it:** Read files modified today, extract what tickets/features were being worked on, what specific things were fixed or added, what decisions were made.

### 2. Jira (via Atlassian MCP) (Less Important Just for sake)
**What:** Company Jira instance accessible via the Atlassian MCP already configured in Claude Code.

**Why it matters:** Provides official ticket keys and exact ticket titles. Also indicates status changes today (moved to In Progress, In Review, Done). Gives structure and official naming to what sessions describe.

**How Claude uses it:** Query `assignee = currentUser() AND updated >= startOfDay()` to find tickets touched today. Get exact titles, current status, any comments added.

### 3. Bitbucket PRs (via Bitbucket token) (Also Just for sake)
**What:** Company Bitbucket Server already accessible via token configured in Claude Code.

**Why it matters:** A PR being opened = strong signal that a ticket is "Done" for the day. PR title often contains the ticket key. Confirms completion in a way sessions alone can't always determine.

**How Claude uses it:** Find PRs opened, reviewed, or commented on today. Map to ticket keys.

### 4. Past EOD History (Very Important context source)
**What:** Last 3–5 EODs stored in Traccia's localStorage, pre-fetched by the app before spawning Claude.

**Why it matters:** Serves two purposes:
1. **Style fingerprint** — teaches Claude the exact writing style, level of detail, vocabulary of this specific user
2. **Ticket title index** — if Claude sees "ATON-7632" in a session but needs the full title, it can find it in a past EOD that mentioned it

**How Claude uses it:** Injected directly into the prompt as few-shot examples and reference material.

---

## How It Should Work (User Flow)

1. User opens Traccia EOD page at end of day
2. Clicks "AI Generate EOD" button
3. Traccia shows a loading state with live progress: `Reading sessions... • Querying Jira... • Checking Bitbucket... • Writing...`
4. After 30–120 seconds, the form auto-fills with generated content
5. User reviews, edits if needed, sends as usual

The generation runs as a background agentic process. Streaming output means the user sees progress, not a frozen spinner.

---

## What This Is NOT

- Not a simple template filler — Claude actually reads and understands session transcripts
- Not dependent on manual user input before generation — it should work with zero pre-fill
- Not requiring any additional credentials or setup beyond what Claude Code already has
- Not a replacement for the user reviewing — the output goes into the editable form, not straight to send
- Not limited to one user — generic tool that adapts to any team member's personal EOD style via their own past EOD history

---

## Success Criteria

A successful generation requires minimal or zero manual editing before sending. The output should:
- Correctly identify all tasks worked on today
- Show accurate WIP/Done status
- Have 2–5 meaningful sub-bullets per ticket
- Use the user's personal writing style
- Be ready to send as-is at least 70% of the time
