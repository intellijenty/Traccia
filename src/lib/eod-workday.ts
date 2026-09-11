// The single definition of "which work day is this".
//
// Shared by the main process (which decides how far back to look for evidence)
// and the renderer (which decides when a saved draft has gone stale, and what
// date to stamp on it). They previously disagreed: evidence gathering used an
// 04:00 boundary while the renderer used calendar midnight, so a draft written
// at 23:50 was discarded at 00:01 as belonging to a different day, and a run
// started at 01:00 was labelled with the wrong date.
//
// The boundary is midnight. Setting WORK_DAY_START_HOUR to 4 restores the
// night-owl behaviour - work done at 01:30 counts towards the previous day -
// and every consumer follows automatically, because they all read it from here.

export const WORK_DAY_START_HOUR = 0

/** Start of the work day that `now` falls in. */
export function effectiveDayStart(now = new Date()): Date {
  const start = new Date(now)
  start.setHours(WORK_DAY_START_HOUR, 0, 0, 0)
  if (now.getTime() < start.getTime()) start.setDate(start.getDate() - 1)
  return start
}

/** YYYY-MM-DD label of the work day `now` falls in. */
export function workDate(now = new Date()): string {
  return effectiveDayStart(now).toLocaleDateString("en-CA")
}
