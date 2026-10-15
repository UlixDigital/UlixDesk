/** Copy for the client invoice and aging reports. Owners and admins only. */

export const invoiceReportCopy = {
  clientTitle: "Client invoices",
  clientBody:
    "Issue date, number, client, status, total, paid, amount due, due date, and overdue. Drafts and void invoices are left out.",
  agingTitle: "Invoice aging",
  agingBody:
    "Unpaid amounts by client: Current, 1-30, 31-60, 61-90, and 90+ days past the due date. Each currency is totaled on its own.",
  denied: "Only owners and admins can view invoice reports.",
  asOfLabel: "As of",
  agingUsesEnd:
    "Aging uses the end date of this range as the as-of date, in the workspace timezone. Current means not yet due on that date.",
  excluded: "Drafts and void invoices are excluded.",
  agingExcluded:
    "Drafts, void invoices, and invoices with nothing due are excluded. Days are counted from the due date.",
  statusAll: "All statuses",
  statusOpen: "Open",
  statusPaid: "Paid",
  overdueYes: "Yes",
  overdueNo: "No",
  current: "Current",
  bucket1: "1-30",
  bucket31: "31-60",
  bucket61: "61-90",
  bucket90: "90+",
  empty: "No invoices in this date range.",
  emptyFiltered: "No invoices match these filters.",
  agingEmpty: "No unpaid invoices as of this date.",
  tooLarge: "Too many invoices for this range. Narrow the dates and try again.",
  currency: "Currency",
  dueDate: "Due date",
  overdue: "Overdue",
  issueDate: "Issue date",
  number: "Number",
} as const;
