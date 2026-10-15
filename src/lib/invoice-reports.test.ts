import { describe, expect, it } from "vitest";
import { clientInvoicesToCsv, parseAgingFilters, parseClientInvoiceFilters } from "@/lib/invoice-reports";

describe("invoice report filters and csv", () => {
  const today = "2026-10-15";

  it("defaults client invoices to this month and aging to today", () => {
    const invoices = parseClientInvoiceFilters({}, today);
    expect(invoices.preset).toBe("this-month");
    expect(invoices.from).toBe("2026-10-01");
    expect(invoices.to).toBe("2026-10-31");
    expect(invoices.status).toBe("all");
    const aging = parseAgingFilters({}, today);
    expect(aging.asOf).toBe(today);
    expect(parseClientInvoiceFilters({ status: "draft" }, today).status).toBe("all");
    expect(parseClientInvoiceFilters({ status: "void" }, today).status).toBe("all");
  });

  it("prefixes a formula-looking client name and keeps paid plus due equal to the total", () => {
    const csv = clientInvoicesToCsv(
      [
        {
          id: "1",
          issueDate: "2026-10-01",
          number: "LE1",
          clientName: "=Acme",
          status: "open",
          currency: "USD",
          totalMinor: 10000,
          paidMinor: 4000,
          dueMinor: 6000,
          dueDate: "2026-09-15",
          overdue: true,
        },
      ],
      [{ currency: "USD", totalMinor: 10000, paidMinor: 4000, dueMinor: 6000 }],
    );
    expect(csv).toContain("'=Acme");
    expect(csv).toContain("40.00");
    expect(csv).toContain("60.00");
    expect(csv).toContain("100.00");
    expect(csv.split("\r\n")[1]?.split(",")[5]).toBe("100.00");
  });
});
