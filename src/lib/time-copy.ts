/** User-facing copy for timesheets, timers, and the extension API. */
export const timeCopy = {
  projectRequired: "Choose a project.",
  projectInactive: "Choose an active project.",
  projectMissing: "That project no longer exists.",
  invalidDate: "Enter a valid date.",
  invalidTime: "Enter a valid time.",
  invalidTimeZone: "Times need a valid timezone. Reload the page and try again.",
  endAfterStart: "End time must be after the start time.",
  futureEnd: "End time can't be in the future.",
  tooLong: "An entry can't be longer than 24 hours.",
  noteTooLong: "Note must be 2000 characters or fewer.",
  overlap: "This time overlaps another entry. You can still save it.",
  formAlert: "Check the highlighted fields and try again.",
  saveFailed: "Something went wrong saving this entry. Try again.",
  entryGone: "This time entry no longer exists.",
  deleteTitle: "Delete this time entry?",
  deleteBody: "This permanently removes the entry. This can't be undone.",
  deleteConfirm: "Delete entry",
  deleting: "Deleting…",
  timerAlready: "A timer is already running. Stop it before starting another.",
  timerNone: "No timer is running.",
  timerShort: "Let the timer run for at least a second before stopping.",
  timerCapped:
    "This timer ran longer than 24 hours, so the saved entry was capped at 24 hours.",
  timerLong:
    "This timer is over 24 hours. Stopping it will save a 24-hour entry.",
  timerIdle: "No timer running",
  chooseProject: "Choose a project to start the timer.",
  timerProjectGone: "That project is no longer active. Choose another project.",
  noProjects: "Add an active project before tracking time.",
  noProjectsTitle: "No active projects",
  dailyEmptyTitle: "No time on this day",
  dailyEmptyBody: "Add time or start a timer to track work for this date.",
  weeklyEmptyTitle: "No time this week",
  weeklyEmptyBody:
    "Add time or start a timer. Hours show up here by project and day.",
  filterEmptyTitle: "No time matches these filters",
  dailyFilterBody:
    "Nothing on this day matches the selected project or client. Try another filter, or clear them.",
  weeklyFilterBody:
    "Nothing this week matches the selected project or client. Try another filter, or clear them.",
  clearFilters: "Clear filters",
  addTime: "Add time",
  addProject: "Add project",
  trackedTitle: "Tracked time",
  trackedHint:
    "Completed time only. A running timer is included after you stop it.",
  timezoneLoadingTitle: "Loading your timesheet",
  timezoneLoadingBody:
    "Times depend on your timezone. This page will refresh in a moment.",
  stopTimerFirstTitle: "Stop the timer first",
  stopTimerFirstBody: "Stop the timer before editing this entry.",
  continuesNext: "Continues into the next day",
  continuesPrevious: "Continues from the previous day",
  endsNextDay: "Ends the next day",
  endDateHint: "This entry crosses midnight.",
  runningBadge: "Running",
  stopBeforeDelete: "Stop the timer before deleting this entry.",
  invalidJson: "Send a JSON body with a project id.",
  jsonContentType: "Content-Type must be application/json.",
  originForbidden: "This origin can't control the timer.",
  previousDay: "Previous day",
  nextDay: "Next day",
  today: "Today",
  previousWeek: "Previous week",
  nextWeek: "Next week",
  thisWeek: "This week",
  start: "Start",
  starting: "Starting…",
  stop: "Stop",
  stopping: "Stopping…",
  saving: "Saving…",
} as const;

export const NOTE_MAX = 2000;
export const MAX_ENTRY_MS = 24 * 60 * 60 * 1000;
export const MIN_TIMER_MS = 1000;
export const LONG_OVERNIGHT_MS = 12 * 60 * 60 * 1000;

/** Shown beside the duration when an automatic overnight roll is longer than 12 hours. */
export function longOvernightWarning(duration: string) {
  return `This entry is ${duration} long and ends the next day. Check the times.`;
}

export type TimerFailureCode =
  | "already-running"
  | "project-required"
  | "project-inactive"
  | "project-missing"
  | "note-too-long"
  | "not-running"
  | "too-short";

export function timerFailureMessage(code: TimerFailureCode) {
  switch (code) {
    case "already-running":
      return timeCopy.timerAlready;
    case "project-required":
      return timeCopy.projectRequired;
    case "project-inactive":
      return timeCopy.projectInactive;
    case "project-missing":
      return timeCopy.projectMissing;
    case "note-too-long":
      return timeCopy.noteTooLong;
    case "not-running":
      return timeCopy.timerNone;
    case "too-short":
      return timeCopy.timerShort;
  }
}
