import type { QuotationListStatus } from "@/lib/quotation-copy";

const STORED = new Set(["draft", "sent", "accepted", "declined"]);

export function isStoredQuotationStatus(status: string) {
  return STORED.has(status);
}

/**
 * Expired is derived. A draft or sent quotation whose valid-until date is
 * before today has expired. Accepted and declined stay as they were recorded.
 * The valid-until day itself is still valid.
 */
export function quotationDisplayStatus(input: {
  status: string;
  validUntil: string;
  today: string;
}): QuotationListStatus {
  if (input.status === "accepted" || input.status === "declined") return input.status;
  if (input.validUntil < input.today) return "expired";
  if (input.status === "sent") return "sent";
  return "draft";
}

export function quotationStatusWhere(
  status: string,
  today: string,
): { status: string | { in: string[] }; validUntil?: { lt: string } | { gte: string } } | null {
  if (status === "expired") {
    return {
      status: { in: ["draft", "sent"] },
      validUntil: { lt: today },
    };
  }
  if (status === "draft" || status === "sent") {
    return { status, validUntil: { gte: today } };
  }
  if (status === "accepted" || status === "declined") return { status };
  return null;
}
