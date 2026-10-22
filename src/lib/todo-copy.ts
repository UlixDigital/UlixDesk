/** User-facing copy for project to-dos and the timer picker. */

export const todoCopy = {
  tab: "To-dos",
  detailsTab: "Details",
  title: "To-dos",
  body: "Work on this project. Done and archived to-dos stay on old time entries and drop out of the timer.",
  add: "Add to-do",
  adding: "Adding…",
  save: "Save",
  saving: "Saving…",
  titleLabel: "Title",
  descriptionLabel: "Description",
  descriptionHint: "Optional.",
  assigneesLabel: "Assignees",
  assignedToYou: "Assigned to you.",
  assigneeRequired: "Choose at least one person.",
  assigneeInvalid: "Choose people who can still sign in.",
  assignDenied: "Only an owner or an admin can assign someone else.",
  titleRequired: "Enter a title.",
  titleTooLong: "Title must be 200 characters or fewer.",
  descriptionTooLong: "Description must be 2000 characters or fewer.",
  projectMissing: "That project no longer exists.",
  unavailable: "Choose an open to-do on this project, or leave it blank.",
  notFound: "That to-do no longer exists.",
  saveFailed: "Something went wrong saving this to-do. Try again.",
  delete: "Delete",
  deleteBlocked: "This to-do has time, so it can't be deleted.",
  markDone: "Mark done",
  reopen: "Reopen",
  archive: "Archive",
  restore: "Restore",
  open: "Open",
  done: "Done",
  archived: "Archived",
  empty: "No to-dos yet. Add one to track work on this project.",
  pickerLabel: "To-do",
  pickerOptional: "Optional",
  pickerSearch: "Search or type a new to-do",
  pickerMine: "My open to-dos",
  pickerEmpty: "No open to-dos yet. Type a title to add one.",
  pickerNone: "No to-do",
  pickerAdd: "Add",
  none: "No to-do",
} as const;

export const TODO_TITLE_MAX = 200;
export const TODO_DESCRIPTION_MAX = 2000;

export function todoAddLabel(title: string) {
  return `Add “${title}”`;
}
