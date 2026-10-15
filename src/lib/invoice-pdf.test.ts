import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";
import { parseInvoiceBankFile } from "../../scripts/invoice-bank-file.mjs";
import { INVOICE_NOTES_WIDTH, pdfTextPositions, referenceInvoicePdfInput, renderInvoicePdf } from "@/lib/invoice-pdf";

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
    expect(pdf.toString("latin1")).toContain("DejaVuSans");

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
    const hoursHeader = at("Total hours");
    const qtyHeader = at("(qty)");
    expect(title).toMatchObject({ x: 28, y: 84 });
    expect(from && to && notes).toBeTruthy();
    expect(from!.x).toBe(28);
    expect(to!.x).toBe(28);
    expect(to!.y).toBeGreaterThan(from!.y);
    expect(issue!.y).toBe(to!.y);
    expect(issue!.x).toBe(407);
    expect(due!.x).toBe(407);
    expect(due!.y).toBeGreaterThan(issue!.y);
    expect(line!.x).toBe(37);
    expect(hours!.x).toBe(374);
    expect(price!.x).toBeGreaterThan(hours!.x);
    expect(amount!.x).toBeGreaterThan(price!.x);
    expect(dueAmount!.y).toBeGreaterThan(subtotal!.y);
    expect(subtotal!.x).toBeGreaterThan(430);
    const subtotalValue = trace.find((item) => item.text === "$659.25" && item.y === subtotal!.y);
    expect((subtotalValue?.x ?? 0) - subtotal!.x).toBeGreaterThan(0);
    expect((subtotalValue?.x ?? 0) - subtotal!.x).toBeLessThan(80);
    expect(notes!.x).toBe(37);
    expect(notes!.y).toBeGreaterThan(line!.y);
    expect(hoursHeader!.y).toBeLessThan(qtyHeader!.y);
    expect(qtyHeader!.x).toBe(374);

    const positions = pdfTextPositions(pdf);
    const positioned = (text: string) => positions.find((item) => item.text.includes(text));
    expect(positions.some((item) => /\d{9,}/.test(item.text))).toBe(false);
    expect(positioned("Invoice LE1175")?.yFromTop).toBeGreaterThan(70);
    expect(positioned("Invoice LE1175")?.yFromTop).toBeLessThan(120);
    expect(positioned("Invoice LE1175")?.x).toBeLessThan(40);
    expect(positioned("FROM")?.x).toBeLessThan(40);
    expect((positioned("Issue date:")?.x ?? 0) > 300).toBe(true);
    expect((positioned("Amount due")?.yFromTop ?? 0) > (positioned("Weekly Invoice")?.yFromTop ?? 999)).toBe(true);

    const artifactDir = process.env.ULIXDESK_INVOICE_ARTIFACTS;
    if (artifactDir) {
      mkdirSync(artifactDir, { recursive: true });
      let bank = placeholderBank;
      try {
        const secret = parseInvoiceBankFile(readFileSync("secrets/invoice-bank-details.txt", "utf8"));
        if (secret && !secret.includes("[not set]")) bank = secret;
      } catch {
        bank = placeholderBank;
      }
      const sample = await renderInvoicePdf(referenceInvoicePdfInput(bank), { compress: false });
      writeFileSync(`${artifactDir}/invoice-sample.pdf`, sample);
    }
  });

  it("gives the notes column enough room for Ulix Digital", () => {
    const doc = new PDFDocument({ size: "LETTER", margin: 0 });
    doc.registerFont("DejaVu", "assets/fonts/DejaVuSans.ttf");
    doc.font("DejaVu").fontSize(9);
    const sentence = "* Use these details to send both Domestic wires and ACH transfers to Ulix Digital";
    expect(doc.widthOfString(sentence)).toBeLessThan(INVOICE_NOTES_WIDTH);
    doc.end();
  });
});
