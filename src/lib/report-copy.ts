/** Exact UI copy and error codes for the reports hub. Members never see amounts. */

export const reportCopy = {
  navLabel: "Reports",
  pageTitle: "Reports",
  intro: "Time reports for this workspace. Weeks run Monday through Sunday in the workspace timezone.",
  ownScope: "You see your own time.",
  allScope: "You see everyone's time.",
  timeActivityTitle: "Time & Activity",
  timeActivityBody:
    "Hours and billable hours for the range. Owners and admins also see the amount in each currency. Activity percentage is not tracked.",
  timeActivityMemberBody:
    "Hours and billable hours for the range. Activity percentage is not tracked.",
  dailyTitle: "Daily totals",
  dailyBody: "One total for each day in the workspace timezone. Group by project for a breakdown of that day.",
  weeklyTitle: "Weekly totals",
  weeklyBody: "Totals for each Monday–Sunday week in the workspace timezone.",
  sessionsTitle: "Work sessions",
  sessionsBody: "Each time entry, with start, end, duration, project, client, notes, and billable.",
  timeEditsBody: "Adds, edits, deletes, and timer start and stop.",
  presetLabel: "Date range",
  presetToday: "Today",
  presetThisWeek: "This week",
  presetLastWeek: "Last week",
  presetThisMonth: "This month",
  presetLastMonth: "Last month",
  presetCustom: "Custom",
  fromLabel: "From",
  toLabel: "To",
  memberLabel: "Member",
  clientLabel: "Client",
  projectLabel: "Project",
  billableLabel: "Billable",
  groupLabel: "Group by",
  allMembers: "All members",
  allClients: "All clients",
  allProjects: "All projects",
  billableAll: "All",
  billableOnly: "Billable",
  billableNone: "Non-billable",
  groupMember: "Member",
  groupClient: "Client",
  groupProject: "Project",
  groupDate: "Date",
  columnsLabel: "Columns",
  exportCsv: "Export CSV",
  exportPdf: "Export PDF",
  exportAll:
    "The CSV and PDF include every matching row, with these filters, groups, and columns. The PDF matches this screen. In the CSV, hours and amounts are numbers.",
  activityExportAll:
    "The PDF uses the standard Time & Activity layout and applies your filters. The CSV includes every matching row, with these filters, groups, and columns. In the CSV, hours and amounts are numbers.",
  activityReportTitle: "Time & Activity Report",
  organizationName: "Ulix Digital",
  grandTotal: "Grand total",
  billedAmount: "Billed Amount",
  billedAmountColumn: "Billed amount",
  billableTime: "Billable Time",
  billableTimeColumn: "Billable time",
  todoId: "To-do ID",
  todos: "To-dos",
  noTodo: "(No to-do)",
  manuallyAdded: "Manually added",
  editedNote: "Edited",
  generatedWith: "Generated with",
  hours: "Hours",
  billableHours: "Billable hours",
  hoursDecimal: "Hours (decimal)",
  billableHoursDecimal: "Billable hours (decimal)",
  durationDecimal: "Duration (decimal)",
  amount: "Amount",
  status: "Status",
  statusBillable: "Billable",
  statusNonBillable: "Non-billable",
  statusNoRate: "No rate",
  week: "Week",
  date: "Date",
  start: "Start",
  end: "End",
  duration: "Duration",
  timeLabel: "Time",
  notes: "Notes",
  billable: "Billable",
  member: "Member",
  noClient: "No client",
  unassigned: "Unassigned",
  noAmount: "No amount",
  total: "Total",
  empty: "No time in this date range.",
  emptyFiltered: "No time matches these filters.",
  rangeOrder: "The start date has to be on or before the end date.",
  tooLarge: "Too many time entries for this range. Narrow the dates and try again.",
  filter: "Filter",
  clearFilters: "Clear filters",
  previous: "Previous",
  next: "Next",
  filtersLabel: "Filters",
  timezoneLabel: "Timezone",
  filterDates: "Dates",
  savedTitle: "Saved reports",
  savedEmpty: "No saved reports yet. Open a report and save it.",
  savedPrivate: "Private",
  savedShared: "Shared",
  savedBy: "Saved by",
  saveReport: "Save report",
  saveTitle: "Save this report",
  saveName: "Name",
  saveWho: "Who can see this",
  savePrivate: "Private",
  savePrivateHint: "Only you can open this.",
  saveShared: "Shared with the workspace",
  saveSharedHint:
    "Everyone in the workspace can open this. A member still sees only their own time, with no amounts.",
  saveSubmit: "Save",
  cancel: "Cancel",
  openSaved: "Open",
  renameSaved: "Rename",
  deleteSaved: "Delete",
  deleteSavedTitle: "Delete this saved report?",
  deleteSavedBody: "This removes the saved name and filters. It does not delete any time.",
  savedNotice: "Report saved.",
  renamedNotice: "Saved report renamed.",
  deletedNotice: "Saved report deleted.",
  nameRequired: "Enter a name.",
  nameTooLong: "Name must be 80 characters or fewer.",
  duplicateName: "You already have a saved report with this name.",
  cannotShare: "Only an owner or an admin can share a report with the workspace.",
  savedUnavailable: "That saved report is not available.",
  savedForbidden: "You can't change this saved report.",
  pdfMatches: "The PDF matches this screen.",
} as const;

export const savedReportCodes = {
  SAVED_REPORT_NAME: "SAVED_REPORT_NAME",
  SAVED_REPORT_NAME_LONG: "SAVED_REPORT_NAME_LONG",
  SAVED_REPORT_DUPLICATE: "SAVED_REPORT_DUPLICATE",
  SAVED_REPORT_SHARE: "SAVED_REPORT_SHARE",
  SAVED_REPORT_NOT_FOUND: "SAVED_REPORT_NOT_FOUND",
  SAVED_REPORT_FORBIDDEN: "SAVED_REPORT_FORBIDDEN",
  SAVED_REPORT_TYPE: "SAVED_REPORT_TYPE",
  SAVED_REPORT_PARAMS: "SAVED_REPORT_PARAMS",
} as const;

export type SavedReportCode = (typeof savedReportCodes)[keyof typeof savedReportCodes];

export const reportCodes = {
  REPORT_RANGE_ORDER: "REPORT_RANGE_ORDER",
  REPORT_TOO_LARGE: "REPORT_TOO_LARGE",
  REPORT_NOT_FOUND: "REPORT_NOT_FOUND",
} as const;

export type ReportCode = (typeof reportCodes)[keyof typeof reportCodes];

export function amountColumnLabel(currency: string) {
  return `${reportCopy.amount} (${currency})`;
}

export function showingRowsLabel(from: number, to: number, total: number) {
  return `Showing ${from}–${to} of ${total}`;
}

export function savedReportNotice(notice: string) {
  if (notice === "saved") return reportCopy.savedNotice;
  if (notice === "renamed") return reportCopy.renamedNotice;
  if (notice === "deleted") return reportCopy.deletedNotice;
  return "";
}

export function savedReportErrorText(code: string) {
  if (code === savedReportCodes.SAVED_REPORT_NAME) return reportCopy.nameRequired;
  if (code === savedReportCodes.SAVED_REPORT_NAME_LONG) return reportCopy.nameTooLong;
  if (code === savedReportCodes.SAVED_REPORT_DUPLICATE) return reportCopy.duplicateName;
  if (code === savedReportCodes.SAVED_REPORT_SHARE) return reportCopy.cannotShare;
  if (code === savedReportCodes.SAVED_REPORT_NOT_FOUND) return reportCopy.savedUnavailable;
  if (code === savedReportCodes.SAVED_REPORT_FORBIDDEN) return reportCopy.savedForbidden;
  if (code === savedReportCodes.SAVED_REPORT_TYPE) return reportCopy.savedUnavailable;
  if (code === savedReportCodes.SAVED_REPORT_PARAMS) return reportCopy.savedUnavailable;
  return "";
}
