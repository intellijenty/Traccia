## v0.4.0 - June 2026

### ✦  Introducing Traccia Intelligence (Beta)

#### Your EOD used to be a stale draft from past day. Now it writes itself.
<br/>

#### Traccia Intelligence reads your actual work - Claude sessions, Git commits, Jira tickets, Bitbucket PRs, Outlook meetings - and produces a complete EOD draft in the format you already use. No prompt engineering. No copy-pasting from Jira. No trying to remember what you did at 9am.

<br/>

- **Note**: This is still experimental feature in beta, it might produce some inaccurate results but custom instructions will lead to more accuracy on style. its also required to have atleast 5 drafts in power composer history to catch up your tone.

### **How it works**

- Press `Ctrl` `G` from anywhere in Power Composer to open the Intelligence panel
- Traccia gathers evidence from every source it can find, cross-references them, then writes the draft in your established EOD style

### **What makes it accurate**
- More claude code sessions context
- More activity across git and jira 
- And the most important 5 recent EOD drafts in Power Composer History


### **Personalize the generation**

- **Project filter** - blocklist projects you never report on, or allowlist only the ones that matter
- **Standing instructions** - write rules once applied every day to match your style and workflow.

### **Also in this release**

Traccia tells you exactly how much of your Claude quota is left, right in the status bar, always in view.
- **Session** - your 5-hour rolling window, shown as `42% · 3h 12m`
- **Hover** for the full breakdown - session and weekly (7-day) utilization, both with progress bars
- Color shifts as you approach limits - subtle at 50%, red at 80%+

## v0.3.3 - June 2026

### Traccia Alpha Program
- Selected users now get early access to experimental features before they’re shipped to everyone.
- There will be a flask icon at rightmost side of bottom statusbar if you are a alpha user.
- **Don’t see any flask icon?** You’re not in the alpha yet. It’s rolling out gradually.
- Stay tuned; we’re working on something really cool 🙂

## v0.3.2 - June 2026
### Improved
- Improved final draft formattings to match original template design format.

### FIXED
- Fixed Meeting sync feature malfunctioning for some users (root cause en-IN device culture).

## v0.3.1 - May 2026

### Improved
- Added support for multiple emails in To field 🙂

## v0.3.0 - May 2026

### Release Notes are not AI Generated; they’re handwritten. So always read them 🙂
#### ik this time it's too much, but I promise it's worth reading.

### NEW
### Time Pulse: Referring Home Page as "Time Pulse" as it reflects the core value of the product and all the features revolve around this.
- **Custom Daily Target** - Right-click any day to set a custom daily target. Choose from any modes, Each mode has quick presets and a custom input dialog. Custom targets always take priority over system calculations. Notifications automatically follows the custom targets. 

### **Power Composer**: Branding the EOD composer feature as "Power Composer" because <u>it's built for **Power Users**</u> 💪🏼
- **Sync Outlook Meetings** - The Power Composer now automatically syncs with your Outlook calendar to import meetings. It daily populates your EOD with current day meetings and automatically removes older ones to keep it clean. Explore advanced options in the Power Composer settings for customization.
- **Sync Holdiays** - The Power Composer now automatically syncs with portal leaves data to import holidays. It automatically populates holiday section with upcoming holidays that falls within predefined window with same meeting like clean up. Explore advanced options in the Power Composer settings.
- **Lazy Inputs** - Type naturally in any task or bullet field. On blur or Enter, the app auto-parses and formats the entry into a clean canonical form. Supports hours (`2hr`, `2.5h`, or just the number `2`), and status (`wip` or `ww`, `done` or `dd`, `hold`) in any order at the end. <br/> Examples: `Fix login bug 2 dd` is formatted as `Fix login bug (2 hr) → Done`. Undo (`CTRL` + `Z`) reverts formatting if needed. check shortcuts dialog for more info.
- **Item Re-ordering** - Drag and drop tasks in the form editor to reorder them within the same project. It also supports the keyboard shortcuts `ALT` + `Up/Down Arrow` to move projects, tasks, and sub-bullets around. Keyboard shortcuts also support cross-project movement.
- **Duplicate Task** - Easily duplicate existing tasks or bullet points in the form editor using the shortcut `ALT` + `D`.
- **Edit History** - The form editor now supports standard undo/redo operations (`CTRL` + `Z` / `CTRL` + `Y`) to navigate through edit history.
- **Multiple Projects** - You can now add multiple projects in the form editor.

### IMPROVED
- The EOD subject line respects user-edited separators like `/`.
- You can now copy the entire content of any item input in the form editor using `CTRL` + `C` when no text is selected.
- Added muted background support in the Power Composer for better readability and eye care. 👀

### FIXED
- Fixed the signature not being added when the new Outlook app is closed.
- Fixed an issue where deleting draft emails deleted every Traccia drafted email because of the same message link.