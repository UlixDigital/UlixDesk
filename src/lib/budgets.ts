import type { Prisma } from "@prisma/client";
import { budgetCodes, budgetCopy, type BudgetCode } from "@/lib/budget-copy";
import {
  budgetFigures,
  budgetPeriodLabel,
  budgetStatus,
  budgetWindow,
  formatHoursInput,
  isBudgetBasis,
  isBudgetRecurrence,
  measureBudgetUse,
  parseAlertPercent,
  parseBudgetStart,
  parseHoursAmount,
  type BudgetBasis,
  type BudgetEntrySlice,
  type BudgetFigures,
  type BudgetRecurrence,
  type BudgetSpec,
  type BudgetUse,
} from "@/lib/budget-period";
import { getWorkspaceCurrency, getWorkspaceTimeZone, listAllBillRates } from "@/lib/bill-rates";
import { prisma } from "@/lib/db";
import { formatMoneyNumber, parseRateInput } from "@/lib/money";
import { pickRate, utcDateKey, type BillRateRecord } from "@/lib/rates";
import { canManageWorkspace, canSeeMoney } from "@/lib/users-validation";

export class BudgetReachedError extends Error {
  readonly code = "budget-reached" as const;
  constructor() {
    super("budget-reached");
    this.name = "BudgetReachedError";
  }
}

export type BudgetRecord = {
  id: string;
  scope: "project" | "client";
  projectId: string | null;
  clientId: string | null;
  basis: BudgetBasis;
  amount: number;
  currency: string | null;
  recurrence: BudgetRecurrence;
  startsOn: string | null;
  billableOnly: boolean;
  alertPercent: number | null;
  hardStop: boolean;
};

export type BudgetFormInput = {
  basis: string;
  amount: string;
  recurrence: string;
  startsOn: string;
  billableOnly: boolean;
  alertPercent: string;
  hardStop: boolean;
};

export type BudgetFormValues = {
  basis: string;
  amount: string;
  recurrence: string;
  startsOn: string;
  billableOnly: boolean;
  alertPercent: string;
  hardStop: boolean;
};

export function budgetFormValues(record: BudgetRecord | null): BudgetFormValues {
  if (!record) {
    return {
      basis: "hours",
      amount: "",
      recurrence: "total",
      startsOn: "",
      billableOnly: true,
      alertPercent: "",
      hardStop: false,
    };
  }
  return {
    basis: record.basis,
    amount:
      record.basis === "hours"
        ? formatHoursInput(record.amount)
        : formatMoneyNumber(record.amount, record.currency ?? "USD"),
    recurrence: record.recurrence,
    startsOn: record.startsOn ?? "",
    billableOnly: record.billableOnly,
    alertPercent: record.alertPercent === null ? "" : String(record.alertPercent),
    hardStop: record.hardStop,
  };
}

type BudgetFailure = { ok: false; code: BudgetCode; error: string };
type SaveSuccess = { ok: true };

function fail(code: BudgetCode, error: string): BudgetFailure {
  return { ok: false, code, error };
}

type BudgetRow = {
  id: string;
  scope: string;
  projectId: string | null;
  clientId: string | null;
  basis: string;
  amount: number;
  currency: string | null;
  recurrence: string;
  startsOn: Date | null;
  billableOnly: boolean;
  alertPercent: number | null;
  hardStop: boolean;
};

function toRecord(row: BudgetRow): BudgetRecord | null {
  if (row.scope !== "project" && row.scope !== "client") return null;
  if (!isBudgetBasis(row.basis) || !isBudgetRecurrence(row.recurrence)) return null;
  return {
    id: row.id,
    scope: row.scope,
    projectId: row.projectId,
    clientId: row.clientId,
    basis: row.basis,
    amount: row.amount,
    currency: row.currency,
    recurrence: row.recurrence,
    startsOn: row.startsOn ? utcDateKey(row.startsOn) : null,
    billableOnly: row.billableOnly,
    alertPercent: row.alertPercent,
    hardStop: row.hardStop,
  };
}

function specOf(record: BudgetRecord): BudgetSpec {
  return {
    basis: record.basis,
    amount: record.amount,
    currency: record.currency,
    recurrence: record.recurrence,
    startsOn: record.startsOn,
    billableOnly: record.billableOnly,
    alertPercent: record.alertPercent,
    hardStop: record.scope === "project" && record.hardStop,
  };
}

type EntryRow = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  billable: boolean;
  userId: string | null;
  projectId: string;
  project: { billable: boolean; clientId: string | null };
};

function slicesFor(
  rows: EntryRow[],
  rates: BillRateRecord[],
  timeZone: string,
): Map<string, BudgetEntrySlice[]> {
  const byProject = new Map<string, BudgetEntrySlice[]>();
  for (const row of rows) {
    if (!row.endedAt) continue;
    const rate = pickRate(
      rates,
      {
        projectId: row.projectId,
        clientId: row.project.clientId,
        userId: row.userId,
        startedAt: row.startedAt,
      },
      timeZone,
    );
    const slice: BudgetEntrySlice = {
      startedAtMs: row.startedAt.getTime(),
      endedAtMs: row.endedAt.getTime(),
      billable: row.billable && row.project.billable,
      rateMinor: rate?.amountMinor ?? null,
      rateCurrency: rate?.currency ?? null,
    };
    const list = byProject.get(row.projectId);
    if (list) list.push(slice);
    else byProject.set(row.projectId, [slice]);
  }
  return byProject;
}

export function evaluateBudget(
  record: BudgetRecord,
  entries: BudgetEntrySlice[],
  timeZone: string,
  now: Date,
): { figures: BudgetFigures; use: BudgetUse; periodLabel: string } {
  const spec = specOf(record);
  const window = budgetWindow({
    recurrence: spec.recurrence,
    startsOn: spec.startsOn,
    timeZone,
    now,
  });
  const use = measureBudgetUse(spec, entries, window);
  return {
    figures: budgetFigures(spec, use),
    use,
    periodLabel: budgetPeriodLabel({
      recurrence: spec.recurrence,
      startsOn: spec.startsOn,
      window,
    }),
  };
}

const entrySelect = {
  id: true,
  startedAt: true,
  endedAt: true,
  billable: true,
  userId: true,
  projectId: true,
  project: { select: { billable: true, clientId: true } },
} as const;

function rateRecords(rows: Array<{
  scope: string;
  id: string;
  clientId: string | null;
  projectId: string | null;
  userId: string | null;
  amountMinor: number;
  currency: string;
  effectiveFrom: Date;
  createdAt: Date;
}>): BillRateRecord[] {
  return rows.flatMap((row) => {
    if (row.scope !== "client" && row.scope !== "project" && row.scope !== "member") return [];
    return [
      {
        id: row.id,
        scope: row.scope,
        clientId: row.clientId,
        projectId: row.projectId,
        userId: row.userId,
        amountMinor: row.amountMinor,
        currency: row.currency,
        effectiveFrom: row.effectiveFrom,
        createdAt: row.createdAt,
      },
    ];
  });
}

async function entriesFor(
  db: Prisma.TransactionClient | typeof prisma,
  where: Prisma.TimeEntryWhereInput,
) {
  return db.timeEntry.findMany({
    where: { endedAt: { not: null }, ...where },
    select: entrySelect,
  });
}

/**
 * True when a project hard stop is already at 100%. Locks the budget row so
 * two manual entries cannot both pass. Running timers are not usage.
 * The entry that crosses 100% is still allowed. The next one is not.
 */
export async function projectBudgetReached(
  tx: Prisma.TransactionClient,
  projectId: string,
  now: Date,
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Budget"
    WHERE "projectId" = ${projectId} AND "hardStop" = true
    FOR UPDATE
  `;
  if (locked.length === 0) return false;
  const row = await tx.budget.findUnique({ where: { projectId } });
  const record = row ? toRecord(row) : null;
  if (!record || !record.hardStop) return false;
  const [timeZone, rates, entries] = await Promise.all([
    getWorkspaceTimeZone(),
    tx.billRate.findMany(),
    entriesFor(tx, { projectId }),
  ]);
  const slices = slicesFor(entries, rateRecords(rates), timeZone).get(projectId) ?? [];
  return evaluateBudget(record, slices, timeZone, now).figures.blocks;
}

export async function getProjectBudget(projectId: string) {
  const row = await prisma.budget.findUnique({ where: { projectId } });
  return row ? toRecord(row) : null;
}

export async function getClientBudget(clientId: string) {
  const row = await prisma.budget.findUnique({ where: { clientId } });
  return row ? toRecord(row) : null;
}

async function costCurrencyFor(input: { scope: "project" | "client"; projectId?: string; clientId?: string }) {
  if (input.scope === "client" && input.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: input.clientId },
      select: { currency: true },
    });
    return client?.currency ?? null;
  }
  if (input.scope === "project" && input.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { client: { select: { currency: true } } },
    });
    if (!project) return null;
    if (project.client?.currency) return project.client.currency;
    return getWorkspaceCurrency();
  }
  return null;
}

export async function saveBudget(input: {
  actorRole: string;
  actorId: string;
  scope: "project" | "client";
  projectId?: string;
  clientId?: string;
  form: BudgetFormInput;
}): Promise<SaveSuccess | BudgetFailure> {
  if (!canManageWorkspace(input.actorRole)) {
    return fail(budgetCodes.BUDGET_FORBIDDEN, budgetCopy.forbidden);
  }
  if (!isBudgetBasis(input.form.basis)) return fail(budgetCodes.BUDGET_BASIS, budgetCopy.basisInvalid);
  if (!isBudgetRecurrence(input.form.recurrence)) {
    return fail(budgetCodes.BUDGET_RECURRENCE, budgetCopy.recurrenceInvalid);
  }
  const start = parseBudgetStart(input.form.startsOn);
  if (!start.ok) {
    return fail(budgetCodes.BUDGET_START, start.range ? budgetCopy.startRange : budgetCopy.startInvalid);
  }
  const alert = parseAlertPercent(input.form.alertPercent);
  if (!alert.ok) return fail(budgetCodes.BUDGET_ALERT, budgetCopy.alertInvalid);

  let amount = 0;
  let currency: string | null = null;
  if (input.form.basis === "hours") {
    const hours = parseHoursAmount(input.form.amount);
    if (!hours.ok) return fail(budgetCodes.BUDGET_AMOUNT, budgetCopy.amountHours);
    amount = hours.seconds;
  } else {
    currency = await costCurrencyFor(input);
    if (!currency) return fail(budgetCodes.BUDGET_CURRENCY, budgetCopy.currencyMissing);
    const parsed = parseRateInput(input.form.amount, currency);
    if (!parsed.ok || parsed.amountMinor <= 0) {
      return fail(budgetCodes.BUDGET_AMOUNT, budgetCopy.amountRequired);
    }
    amount = parsed.amountMinor;
  }

  const startsOn = start.startsOn ? new Date(`${start.startsOn}T00:00:00.000Z`) : null;
  const hardStop = input.scope === "project" && input.form.hardStop;
  const data = {
    scope: input.scope,
    basis: input.form.basis,
    amount,
    currency,
    recurrence: input.form.recurrence,
    startsOn,
    billableOnly: input.form.billableOnly,
    alertPercent: alert.percent,
    hardStop,
  };

  if (input.scope === "project") {
    if (!input.projectId) return fail(budgetCodes.BUDGET_NOT_FOUND, budgetCopy.subjectMissing);
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true },
    });
    if (!project) return fail(budgetCodes.BUDGET_NOT_FOUND, budgetCopy.subjectMissing);
    await prisma.budget.upsert({
      where: { projectId: input.projectId },
      create: { ...data, projectId: input.projectId, clientId: null, createdById: input.actorId },
      update: data,
    });
    return { ok: true };
  }

  if (!input.clientId) return fail(budgetCodes.BUDGET_NOT_FOUND, budgetCopy.subjectMissing);
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true },
  });
  if (!client) return fail(budgetCodes.BUDGET_NOT_FOUND, budgetCopy.subjectMissing);
  await prisma.budget.upsert({
    where: { clientId: input.clientId },
    create: { ...data, clientId: input.clientId, projectId: null, createdById: input.actorId },
    update: data,
  });
  return { ok: true };
}

export async function deleteBudget(input: {
  actorRole: string;
  scope: "project" | "client";
  projectId?: string;
  clientId?: string;
}): Promise<SaveSuccess | BudgetFailure> {
  if (!canManageWorkspace(input.actorRole)) {
    return fail(budgetCodes.BUDGET_FORBIDDEN, budgetCopy.forbidden);
  }
  if (input.scope === "project" && input.projectId) {
    await prisma.budget.deleteMany({ where: { projectId: input.projectId } });
    return { ok: true };
  }
  if (input.scope === "client" && input.clientId) {
    await prisma.budget.deleteMany({ where: { clientId: input.clientId } });
    return { ok: true };
  }
  return fail(budgetCodes.BUDGET_NOT_FOUND, budgetCopy.subjectMissing);
}

export type BudgetProgress = {
  record: BudgetRecord;
  figures: BudgetFigures;
  periodLabel: string;
  status: string;
  timeZone: string;
};

async function progressFor(
  record: BudgetRecord,
  entries: EntryRow[],
  rates: BillRateRecord[],
  timeZone: string,
  now: Date,
): Promise<BudgetProgress> {
  const byProject = slicesFor(entries, rates, timeZone);
  const slices =
    record.scope === "project"
      ? (byProject.get(record.projectId ?? "") ?? [])
      : [...byProject.entries()]
          .filter(([projectId]) =>
            entries.some((row) => row.projectId === projectId && row.project.clientId === record.clientId),
          )
          .flatMap(([, list]) => list);
  const evaluated = evaluateBudget(record, slices, timeZone, now);
  return {
    record,
    figures: evaluated.figures,
    periodLabel: evaluated.periodLabel,
    status: budgetStatus(evaluated.figures),
    timeZone,
  };
}

export async function projectBudgetProgress(input: {
  projectId: string;
  role: string;
  userId: string;
  now?: Date;
}): Promise<BudgetProgress | null> {
  const record = await getProjectBudget(input.projectId);
  if (!record) return null;
  const manager = canManageWorkspace(input.role);
  if (!manager) {
    if (record.basis !== "hours") return null;
    const own = await prisma.timeEntry.findFirst({
      where: { userId: input.userId, projectId: input.projectId },
      select: { id: true },
    });
    if (!own) return null;
  }
  const now = input.now ?? new Date();
  const [timeZone, rates, entries] = await Promise.all([
    getWorkspaceTimeZone(),
    listAllBillRates(),
    entriesFor(prisma, { projectId: input.projectId }),
  ]);
  const progress = await progressFor(record, entries, rates, timeZone, now);
  if (!canSeeMoney(input.role) && record.basis === "cost") return null;
  return progress;
}

export async function clientBudgetProgress(input: {
  clientId: string;
  role: string;
  now?: Date;
}): Promise<BudgetProgress | null> {
  if (!canSeeMoney(input.role)) return null;
  const record = await getClientBudget(input.clientId);
  if (!record) return null;
  const now = input.now ?? new Date();
  const [timeZone, rates, entries] = await Promise.all([
    getWorkspaceTimeZone(),
    listAllBillRates(),
    entriesFor(prisma, { project: { clientId: input.clientId } }),
  ]);
  return progressFor(record, entries, rates, timeZone, now);
}

export type BudgetReportFilters = {
  clientId: string;
  projectId: string;
  includeArchived: boolean;
  kind: "all" | "projects" | "clients";
};

export type BudgetReportRow = {
  id: string;
  name: string;
  typeLabel: string;
  basis: BudgetBasis;
  currency: string | null;
  periodLabel: string;
  figures: BudgetFigures;
  status: string;
  archived: boolean;
};

export async function listBudgetReport(input: {
  actor: { id: string; role: string };
  filters: BudgetReportFilters;
  now?: Date;
}): Promise<{ rows: BudgetReportRow[]; timeZone: string; showMoney: boolean }> {
  const showMoney = canSeeMoney(input.actor.role);
  const manager = canManageWorkspace(input.actor.role);
  const now = input.now ?? new Date();
  const budgets = (await prisma.budget.findMany({
    include: {
      project: { select: { id: true, name: true, archivedAt: true, clientId: true } },
      client: { select: { id: true, name: true, archivedAt: true } },
    },
  }))
    .map((row) => {
      const record = toRecord(row);
      if (!record) return null;
      return { record, project: row.project, client: row.client };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const ownProjects = manager
    ? null
    : new Set(
        (
          await prisma.timeEntry.findMany({
            where: { userId: input.actor.id },
            distinct: ["projectId"],
            select: { projectId: true },
          })
        ).map((row) => row.projectId),
      );

  const visible = budgets.filter(({ record, project, client }) => {
    if (!showMoney) {
      if (record.scope !== "project" || record.basis !== "hours" || !record.projectId) return false;
      if (!ownProjects?.has(record.projectId)) return false;
    }
    if (input.filters.kind === "projects" && record.scope !== "project") return false;
    if (input.filters.kind === "clients" && record.scope !== "client") return false;
    const archived = record.scope === "project" ? project?.archivedAt != null : client?.archivedAt != null;
    if (archived && !input.filters.includeArchived) return false;
    if (input.filters.clientId) {
      if (record.scope === "client" && record.clientId !== input.filters.clientId) return false;
      if (record.scope === "project" && project?.clientId !== input.filters.clientId) return false;
    }
    if (input.filters.projectId && record.projectId !== input.filters.projectId) return false;
    return true;
  });

  const projectIds = [
    ...new Set(
      visible.flatMap(({ record }) => (record.scope === "project" && record.projectId ? [record.projectId] : [])),
    ),
  ];
  const clientIds = [
    ...new Set(
      visible.flatMap(({ record }) => (record.scope === "client" && record.clientId ? [record.clientId] : [])),
    ),
  ];
  const orFilters: Prisma.TimeEntryWhereInput[] = [];
  if (projectIds.length > 0) orFilters.push({ projectId: { in: projectIds } });
  if (clientIds.length > 0) orFilters.push({ project: { clientId: { in: clientIds } } });
  const [timeZone, rates, loaded] = await Promise.all([
    getWorkspaceTimeZone(),
    showMoney ? listAllBillRates() : Promise.resolve([]),
    orFilters.length > 0 ? entriesFor(prisma, { OR: orFilters }) : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  const unique = loaded.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  const byProject = slicesFor(unique, rates, timeZone);
  const clientOf = new Map(unique.map((row) => [row.projectId, row.project.clientId]));

  const rows: BudgetReportRow[] = visible.map(({ record, project, client }) => {
    const slices =
      record.scope === "project"
        ? (byProject.get(record.projectId ?? "") ?? [])
        : [...byProject.entries()]
            .filter(([projectId]) => clientOf.get(projectId) === record.clientId)
            .flatMap(([, list]) => list);
    const evaluated = evaluateBudget(record, slices, timeZone, now);
    const archived = record.scope === "project" ? project?.archivedAt != null : client?.archivedAt != null;
    return {
      id: record.id,
      name: record.scope === "project" ? (project?.name ?? "Project") : (client?.name ?? "Client"),
      typeLabel: record.scope === "project" ? budgetCopy.typeProject : budgetCopy.typeClient,
      basis: record.basis,
      currency: showMoney ? record.currency : null,
      periodLabel: evaluated.periodLabel,
      figures: evaluated.figures,
      status: budgetStatus(evaluated.figures),
      archived,
    };
  });

  rows.sort((a, b) => {
    if (a.typeLabel !== b.typeLabel) return a.typeLabel === budgetCopy.typeProject ? -1 : 1;
    const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id);
  });
  return { rows, timeZone, showMoney };
}

export function parseBudgetReportFilters(
  params: Record<string, string | string[] | undefined>,
): BudgetReportFilters {
  const first = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const kind = first("kind");
  return {
    clientId: first("client"),
    projectId: first("project"),
    includeArchived: first("archived") === "include",
    kind: kind === "projects" || kind === "clients" ? kind : "all",
  };
}
