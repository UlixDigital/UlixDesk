import { DEFAULT_CURRENCY } from "@/lib/currencies";
import { prisma } from "@/lib/db";
import { invoiceCopy } from "@/lib/invoice-copy";
import { parseInvoiceSettings, type InvoiceSettingsWrite } from "@/lib/invoice-form";
import { formatPercentBps } from "@/lib/invoice-money";
import { canManageWorkspace } from "@/lib/users-validation";
import { DEFAULT_TIME_ZONE } from "@/lib/workspace-time";

const WORKSPACE_ID = "workspace";

export type InvoiceSettings = InvoiceSettingsWrite & {
  timeZone: string;
};

export async function getInvoiceSettings(): Promise<InvoiceSettings> {
  const row = await prisma.workspaceSettings.upsert({
    where: { id: WORKSPACE_ID },
    update: {},
    create: {
      id: WORKSPACE_ID,
      defaultCurrency: DEFAULT_CURRENCY,
      timeZone: DEFAULT_TIME_ZONE,
    },
  });
  return {
    companyName: row.companyName,
    companyAddress: row.companyAddress,
    invoicePrefix: row.invoicePrefix,
    nextInvoiceNumber: row.nextInvoiceNumber,
    invoiceNetTermsDays: row.invoiceNetTermsDays,
    invoiceNotes: row.invoiceNotes,
    invoiceBankDetails: row.invoiceBankDetails,
    invoiceTaxEnabled: row.invoiceTaxEnabled,
    invoiceTaxLabel: row.invoiceTaxLabel,
    invoiceTaxRateBps: row.invoiceTaxRateBps,
    timeZone: row.timeZone,
  };
}

export function invoiceSettingsFormValues(settings: InvoiceSettings) {
  return {
    ...settings,
    nextInvoiceNumber: String(settings.nextInvoiceNumber),
    invoiceNetTermsDays: String(settings.invoiceNetTermsDays),
    invoiceTaxRate: formatPercentBps(settings.invoiceTaxRateBps).replace("%", ""),
  };
}

export async function saveInvoiceSettings(actorRole: string, input: Parameters<typeof parseInvoiceSettings>[0]) {
  if (!canManageWorkspace(actorRole)) return { ok: false as const, error: invoiceCopy.denied };
  const parsed = parseInvoiceSettings(input);
  if (!parsed.ok) return parsed;
  await prisma.workspaceSettings.upsert({
    where: { id: WORKSPACE_ID },
    update: parsed.data,
    create: {
      id: WORKSPACE_ID,
      defaultCurrency: DEFAULT_CURRENCY,
      timeZone: DEFAULT_TIME_ZONE,
      ...parsed.data,
    },
  });
  return { ok: true as const };
}
