/** Exact UI copy and error codes for bill rates. Members never see these amounts. */

export const rateCopy = {
  currencyLabel: "Currency",
  currencyHint:
    "Hourly bill rates for this client use this currency. New clients start with the workspace default.",
  currencyKeepHint:
    "Rates already saved keep their currency. New rates use the currency you save here.",
  currencyRequired: "Choose a currency.",
  workspaceTitle: "Workspace currency",
  workspaceBody:
    "New clients use this currency. Changing it does not change clients you already added.",
  workspaceLabel: "Default currency",
  workspaceSave: "Save currency",
  workspaceSaved: "Workspace currency saved.",
  currencySaveFailed: "Something went wrong saving the currency. Try again.",
  clientRateTitle: "Hourly bill rate",
  clientRateBody:
    "Optional. Time that starts on or after the effective date uses this rate, unless a project rate or a member rate overrides it.",
  precedence: "A project rate wins, then a member rate, then this client rate.",
  amountLabel: "Hourly rate",
  effectiveLabel: "Effective from",
  effectiveHint: "Applies from 00:00 UTC on this date. Earlier time keeps the previous rate.",
  saveRate: "Save rate",
  savingRate: "Saving…",
  rateSaved: "Rate saved.",
  historyTitle: "Rate history",
  historyEmpty: "No bill rate yet. Time is tracked, and the amount stays blank until you set one.",
  historyRule: "The latest save for a date is the one that applies.",
  projectRateTitle: "Bill rate override",
  projectRateBody:
    "Optional. This rate is in the client's currency and wins over the member rate and the client rate.",
  projectNeedsClient:
    "Link a client before setting a bill rate. A project with no client has no currency, so its time has no bill amount.",
  projectNonBillable:
    "This project is non-billable, so its time is not billed even when an entry is marked billable.",
  projectBillableHint:
    "On by default. Turn this off and every entry on this project is non-billable, even if an entry is marked billable.",
  entryBillableHint:
    "Starts from the project. You can change it for this entry. A non-billable project is not billed, even if this entry is marked billable.",
  entryProjectNonBillable: "This project is non-billable, so this time is not billed.",
  memberRateTitle: "Member bill rates",
  memberRateBody:
    "Optional. A member rate overrides the client rate for that person's time. A project rate still wins. The amount uses this client's currency.",
  memberLabel: "Member",
  memberPlaceholder: "Select a member",
  memberHistoryEmpty: "No member rates yet.",
  amountInvalid: "Enter an hourly rate, such as 50 or 50.00.",
  amountWhole: "This currency uses whole numbers only.",
  amountTooLarge: "Enter a smaller hourly rate.",
  dateInvalid: "Enter the date this rate starts.",
  clientRequired: "Link a client before setting a bill rate.",
  memberRequired: "Choose a member.",
  clientGone: "This client no longer exists.",
  projectGone: "This project no longer exists.",
  memberGone: "That member no longer exists.",
  saveFailed: "Something went wrong saving this rate. Try again.",
  noAmount: "No amount",
  unrated: "Some billable time has no rate, so it has no amount.",
  billablePrefix: "Billable",
  trackedAmountLabel: "Billable amount",
  trackedNoAmount: "No bill rate covers this billable time, so there is no amount.",
} as const;

export function amountDecimalsMessage(digits: number) {
  return `This currency allows ${digits} decimal places.`;
}

export function rateHistoryLine(amount: string, date: string) {
  return `${amount} from ${date}`;
}

export const rateCodes = {
  RATE_FORBIDDEN: "RATE_FORBIDDEN",
  CURRENCY_INVALID: "CURRENCY_INVALID",
  RATE_INVALID: "RATE_INVALID",
  RATE_TOO_PRECISE: "RATE_TOO_PRECISE",
  RATE_DATE_INVALID: "RATE_DATE_INVALID",
  RATE_CLIENT_REQUIRED: "RATE_CLIENT_REQUIRED",
  RATE_MEMBER_REQUIRED: "RATE_MEMBER_REQUIRED",
  RATE_NOT_FOUND: "RATE_NOT_FOUND",
  RATE_SAVE_FAILED: "RATE_SAVE_FAILED",
} as const;

export type RateCode = (typeof rateCodes)[keyof typeof rateCodes];
