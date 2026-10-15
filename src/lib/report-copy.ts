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
  dailyTitle: "Daily totals",
  dailyBody: "Totals for each day in the workspace timezone.",
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
  exportAll: "The CSV includes every matching row, with these filters, groups, and columns.",
  hours: "Hours",
  billableHours: "Billable hours",
  amount: "Amount",
  week: "Week",
  date: "Date",
  start: "Start",
  end: "End",
  duration: "Duration",
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
} as const;

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
