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