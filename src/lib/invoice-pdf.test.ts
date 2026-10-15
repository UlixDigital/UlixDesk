import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pdfTextPositions, referenceInvoicePdfInput, renderInvoicePdf } from "@/lib/invoice-pdf";

const placeholderBank = [
  "Beneficiary Name: Ulix Digital",
  "Address: 30 North Gould Street, Sheridan, WY 82801",
  "",
  "Account Number: [not set]",
  "ABA Routing Number: [not set]",
  "Type of Account: Checking",
  "Bank Name: [not set]",
].join("\n");

describe("invoice pdf layout", () => {
  it("places the reference invoice in the expected regions", async () => {
    const trace: Array<{ text: string; x: number; y: number }> = [];
    const pdf = await renderInvoicePdf(referenceInvoicePdfInput(placeholderBank), {
      compress: false,
      trace,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1").includes("/Image")).toBe(true);

    const at = (text: string) => trace.find((item) => item.text === text);
    const title = at("Invoice LE1175");
    const from = at("FROM");
    const to = at("TO");
    const issue = at("Issue date:");
    const due = at("Due date:");
    const line = at("Weekly Invoice");
    const hours = at("26:22:12");
    const price = at("$25.00");
    const amount = at("$659.25");
    const dueAmount = at("Amount due");
    const subtotal = at("Subtotal");
    const notes = at("Notes");
    expect(title).toMatchObject({ x: 40, y: 48 });
    expect(from && to && notes).toBeTruthy();
    expect(from!.x).toBe(40);
    expect(to!.x).toBe(40);
    expect(to!.y).toBeGreaterThan(from!.y);
    expect(issue!.x).toBe(360);
    expect(due!.x).toBe(360);
    expect(due!.y).toBeGreaterThan(issue!.y);
    expect(issue!.x).toBeGreaterThan(from!.x);
    expect(line!.x).toBeLessThan(200);
    expect(hours!.x).toBeGreaterThan(line!.x);
    expect(price!.x).toBeGreaterThan(hours!.x);
    expect(amount!.x).toBeGreaterThan(price!.x);
    expect(dueAmount!.y).toBeGreaterThan(subtotal!.y);
    expect(notes!.x).toBe(40);
    expect(notes!.y).toBeGreaterThan(line!.y);

    const positions = pdfTextPositions(pdf);
    const positioned = (text: string) => positions.find((item) => item.text.includes(text));
    expect(positions.some((item) => /\d{9,}/.test(item.text))).toBe(false);
    expect(positioned("Invoice LE1175")?.yFromTop).toBeLessThan(80);
    expect(positioned("Invoice LE1175")?.x).toBeLessThan(80);
    expect(positioned("FROM")?.x).toBeLessThan(80);
    expect((positioned("Issue date:")?.x ?? 0) > 300).toBe(true);
    expect((positioned("Amount due")?.yFromTop ?? 0) > (positioned("Weekly Invoice")?.yFromTop ?? 999)).toBe(true);

    const artifactDir = process.env.ULIXDESK_INVOICE_ARTIFACTS;
    if (artifactDir) {
      mkdirSync(artifactDir, { recursive: true });
      let bank = placeholderBank;
      try {
        const secret = readFileSync("secrets/invoice-bank-details.txt", "utf8").trim();
        if (secret && !secret.startsWith("#")) bank = secret.replace(/^#.*\n/gm, "").trim();
      } catch {
        bank = placeholderBank;
      }
      const sample = await renderInvoicePdf(referenceInvoicePdfInput(bank), { compress: false });
      writeFileSync(`${artifactDir}/invoice-sample.pdf`, sample);
    }
  });
});
