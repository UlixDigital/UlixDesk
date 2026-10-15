/** Exact UI copy for the manual time edits report. Members never see amounts. */

export const changeSources = ["web", "extension", "api"] as const;
export type ChangeSource = (typeof changeSources)[number];

export const changeActions = ["added", "edited", "deleted", "started", "stopped"] as const;
export type ChangeAction = (typeof changeActions)[number];

export const changeActionFilters = ["added", "edited", "deleted", "timer"] as const;
export type ChangeActionFilter = (typeof changeActionFilters)[number];

export const timeChangeCopy = {
  navLabel: "Time edits",
  pageTitle: "Time edits",
  intro:
    "Adds, edits, deletes, and timer start and stop. The date range uses the workspace timezone.",
  historyNote:
    "Time entries that already existed before this log have no history. Only changes saved after the log was added are listed.",
  ownScope: "You see changes to your own time.",
  allScope: "You see changes for everyone.",
  fromLabel: "From",
  toLabel: "To",
  memberLabel: "Member",
  clientLabel: "Client",
  projectLabel: "Project",
  actionLabel: "Action",
  allMembers: "All members",
  allClients: "All clients",
  allProjects: "All projects",
  allActions: "All actions",
  actionAdded: "Added",
  actionEdited: "Edited",
  actionDeleted: "Deleted",
  actionTimer: "Timer",
  actionStarted: "Timer started",
  actionStopped: "Timer stopped",
  sourceWeb: "Web",
  sourceExtension: "Extension",
  sourceApi: "API",
  filter: "Filter",
  clearFilters: "Clear filters",
  empty: "No time changes in this date range.",
  emptyFiltered: "No time changes match these filters.",
  rangeOrder: "The start date has to be on or before the end date.",
  fieldStart: "Start",
  fieldEnd: "End",
  fieldDuration: "Duration",
  fieldProject: "Project",
  fieldClient: "Client",
  fieldNotes: "Notes",
  fieldBillable: "Billable",
  emptyValue: "—",
  removedProject: "Removed project",
  removedClient: "Removed client",
  previous: "Previous",
  next: "Next",
  unchanged: "No tracked fields changed.",
} as const;

export const timeChangeCodes = {
  RANGE_ORDER: "RANGE_ORDER",
} as const;

export type TimeChangeCode = (typeof timeChangeCodes)[keyof typeof timeChangeCodes];

export function showingChangesLabel(from: number, to: number, total: number) {
  return `Showing ${from}–${to} of ${total}`;
}

export function timeEditsHref(
  input: {
    from?: string;
    to?: string;
    memberId?: string;
    clientId?: string;
    projectId?: string;
    action?: string;
    page?: number;
  } = {},
) {
  const params = new URLSearchParams();
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (input.memberId) params.set("member", input.memberId);
  if (input.clientId) params.set("client", input.clientId);
  if (input.projectId) params.set("project", input.projectId);
  if (input.action) params.set("action", input.action);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return query ? `/reports/manual-time-edits?${query}` : "/reports/manual-time-edits";
}

export function actionVerb(action: ChangeAction) {
  if (action === "added") return timeChangeCopy.actionAdded;
  if (action === "edited") return timeChangeCopy.actionEdited;
  if (action === "deleted") return timeChangeCopy.actionDeleted;
  if (action === "started") return timeChangeCopy.actionStarted;
  return timeChangeCopy.actionStopped;
}

export function sourceLabel(source: ChangeSource) {
  if (source === "extension") return timeChangeCopy.sourceExtension;
  if (source === "api") return timeChangeCopy.sourceApi;
  return timeChangeCopy.sourceWeb;
}

/** "Edited by Jane" or "Edited by Jane for Sam" when the actor is not the entry owner. */
export function changeByline(input: {
  action: ChangeAction;
  actorId: string;
  actorName: string;
  entryUserId: string | null;
  entryUserName: string | null;
}) {
  const verb = actionVerb(input.action);
  const self = `${verb} by ${input.actorName}`;
  if (!input.entryUserId || input.entryUserId === input.actorId) return self;
  return `${self} for ${input.entryUserName ?? "someone"}`;
}
