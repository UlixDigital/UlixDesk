import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";
import { parseInvoiceBankFile } from "../../scripts/invoice-bank-file.mjs";
import { pdfQuantityHeader, toInvoicePdfInput } from "@/lib/invoice-document";
import {
  INVOICE_NOTES_LINE_GAP,
  INVOICE_NOTES_WIDTH,
  INVOICE_TOTAL_ROW,
  pdfTextPositions,
  referenceInvoicePdfInput,
  renderInvoicePdf,
} from "@/lib/invoice-pdf";

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
    expect(pdf.toString("latin1")).toContain("7.2");
    expect(pdf.toString("latin1")).toContain("8.3");

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
    const paid = at("Paid");
    const docWidths = new PDFDocument({ size: "LETTER", margin: 0 });
    docWidths.registerFont("DejaVu-Bold", "assets/fonts/DejaVuSans-Bold.ttf");
    docWidths.font("DejaVu-Bold").fontSize(7.2);
    const subtotalRight = (subtotal?.x ?? 0) + docWidths.widthOfString("Subtotal");
    const paidRight = (paid?.x ?? 0) + docWidths.widthOfString("Paid");
    docWidths.end();
    expect(paidRight).toBeCloseTo(subtotalRight, 0);

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

  it("keeps notes and totals about 2.5pt looser than a tight line", async () => {
    const trace: Array<{ text: string; x: number; y: number }> = [];
    await renderInvoicePdf(referenceInvoicePdfInput(placeholderBank), { compress: false, trace });
    const first = trace.find((item) => item.text.startsWith("* All payments"));
    const second = trace.find((item) => item.text.startsWith("* Use these details"));
    const subtotal = trace.find((item) => item.text === "Subtotal");
    const total = trace.find((item) => item.text === "Total");
    expect(first && second && subtotal && total).toBeTruthy();
    const noteStep = (second?.y ?? 0) - (first?.y ?? 0);
    const measure = new PDFDocument({ size: "LETTER", margin: 0 });
    measure.registerFont("DejaVu", "assets/fonts/DejaVuSans.ttf");
    measure.font("DejaVu").fontSize(8.3);
    const sample = "* All payments are non refundable";
    const tight = measure.heightOfString(sample, { width: INVOICE_NOTES_WIDTH, lineGap: 0 });
    const loose = measure.heightOfString(sample, { width: INVOICE_NOTES_WIDTH, lineGap: INVOICE_NOTES_LINE_GAP });
    measure.end();
    expect(loose - tight).toBeGreaterThanOrEqual(2);
    expect(loose - tight).toBeLessThanOrEqual(3);
    expect(noteStep).toBeCloseTo(loose, 1);
    expect((total?.y ?? 0) - (subtotal?.y ?? 0)).toBeCloseTo(INVOICE_TOTAL_ROW, 1);
    expect(INVOICE_TOTAL_ROW - 16).toBeGreaterThanOrEqual(2);
    expect(INVOICE_TOTAL_ROW - 16).toBeLessThanOrEqual(3);
  });

  it("prints Overdue with Paid and Amount due when a balance is past due", async () => {
    const input = referenceInvoicePdfInput(placeholderBank);
    input.overdue = true;
    input.totals = [
      { label: "Total", value: "$100.00" },
      { label: "Paid", value: "$40.00" },
      { label: "Amount due", value: "$60.00", emphasize: true },
    ];
    const trace: Array<{ text: string; x: number; y: number }> = [];
    await renderInvoicePdf(input, { compress: false, trace });
    expect(trace.some((item) => item.text === "Overdue:")).toBe(true);
    expect(trace.some((item) => item.text === "Yes")).toBe(true);
    expect(trace.some((item) => item.text === "Paid")).toBe(true);
    expect(trace.some((item) => item.text === "$40.00")).toBe(true);
    expect(trace.some((item) => item.text === "Amount due")).toBe(true);
    expect(trace.some((item) => item.text === "$60.00")).toBe(true);
  });

  it("prints a manual line's date range and H:MM:SS quantity", async () => {
    const trace: Array<{ text: string; x: number; y: number }> = [];
    const input = toInvoicePdfInput({
      companyName: "Ulix Digital",
      companyAddress: "30 North Gould Street, Sheridan, WY 82801",
      number: "LE2001",
      clientName: "WSI Web Enhancers",
      clientAddress: "4801 Lang Ave NE",
      currency: "USD",
      issueDate: "2026-10-12",
      dueDate: "2026-10-19",
      poNumber: null,
      notes: "",
      bankDetails: placeholderBank,
      discountMinor: 0,
      discountKind: "none",
      discountBps: 0,
      taxEnabled: false,
      taxLabel: "Tax",
      taxRateBps: 0,
      subtotalMinor: 6000,
      taxMinor: 0,
      totalMinor: 6000,
      paidMinor: 0,
      lines: [
        {
          title: "Design review",
          detail: "",
          quantitySeconds: 5400,
          quantityMs: 5_400_000n,
          rangeStart: "2026-10-01",
          rangeEnd: "2026-10-03",
          unitPriceMinor: 4000,
          amountMinor: 6000,
        },
      ],
    });
    expect(input.lines[0]).toMatchObject({
      quantity: "1:30:00",
      detail: "Thu, Oct 1, 2026 - Sat, Oct 3, 2026",
    });
    expect(input.quantityHeader).toBe("hours");
    await renderInvoicePdf(input, { compress: false, trace });
    expect(trace.some((item) => item.text === "Total hours")).toBe(true);
    expect(trace.some((item) => item.text === "(qty)")).toBe(true);
    expect(trace.some((item) => item.text === "Qty")).toBe(false);
    expect(trace.some((item) => item.text === "Design review")).toBe(true);
    expect(trace.some((item) => item.text === "1:30:00")).toBe(true);
    expect(trace.some((item) => item.text === "Thu, Oct 1, 2026 - Sat, Oct 3, 2026")).toBe(true);
  });

  it("prints an item quantity as a plain count", async () => {
    const input = toInvoicePdfInput({
      companyName: "Ulix Digital",
      companyAddress: "30 North Gould Street, Sheridan, WY 82801",
      number: "LE2002",
      clientName: "WSI Web Enhancers",
      clientAddress: "4801 Lang Ave NE",
      currency: "USD",
      issueDate: "2026-10-12",
      dueDate: "2026-10-19",
      poNumber: null,
      notes: "",
      bankDetails: placeholderBank,
      discountMinor: 0,
      discountKind: "none",
      discountBps: 0,
      taxEnabled: false,
      taxLabel: "Tax",
      taxRateBps: 0,
      subtotalMinor: 50_000,
      taxMinor: 0,
      totalMinor: 50_000,
      paidMinor: 0,
      lines: [
        {
          title: "Website design",
          detail: "",
          quantityKind: "item",
          quantitySeconds: 0,
          quantityMs: 100_000n,
          unitPriceMinor: 50_000,
          amountMinor: 50_000,
        },
      ],
    });
    expect(input.lines[0]?.quantity).toBe("1");
    expect(input.quantityHeader).toBe("item");
    const trace: Array<{ text: string; x: number; y: number }> = [];
    await renderInvoicePdf(input, { compress: false, trace });
    const qty = trace.find((item) => item.text === "Qty");
    const description = trace.find((item) => item.text === "Description");
    expect(qty).toMatchObject({ x: 374 });
    expect(qty?.y).toBe(description?.y);
    expect(trace.some((item) => item.text === "Total hours")).toBe(false);
    expect(trace.some((item) => item.text === "(qty)")).toBe(false);
    expect(trace.some((item) => item.text === "1")).toBe(true);
    expect(trace.some((item) => item.text === "1:00:00")).toBe(false);
    expect(trace.some((item) => item.text === "$500.00")).toBe(true);
    expect(pdfQuantityHeader([{ quantityKind: "hours" }, { quantityKind: "item" }])).toBe("item");
    expect(pdfQuantityHeader([{ quantityKind: "hours" }])).toBe("hours");
  });

  it("prints CRLF and lone CR in notes and bank details as line breaks, not question marks", async () => {
    const trace: Array<{ text: string; x: number; y: number }> = [];
    const input = referenceInvoicePdfInput("Beneficiary Name: Example Studio\rAccount: 0000");
    input.notes = "Thanks.\r\nSee you next month.";
    await renderInvoicePdf(input, { compress: false, trace });
    expect(trace.some((item) => item.text === "Thanks.")).toBe(true);
    expect(trace.some((item) => item.text === "See you next month.")).toBe(true);
    expect(trace.some((item) => item.text === "Beneficiary Name: Example Studio")).toBe(true);
    expect(trace.some((item) => item.text === "Account: 0000")).toBe(true);
    expect(trace.some((item) => item.text.includes("?") || item.text.includes("\r"))).toBe(false);
  });

  it("gives the notes column enough room for Ulix Digital", () => {
    const doc = new PDFDocument({ size: "LETTER", margin: 0 });
    doc.registerFont("DejaVu", "assets/fonts/DejaVuSans.ttf");
    doc.font("DejaVu").fontSize(8.3);
    const sentence = "* Use these details to send both Domestic wires and ACH transfers to Ulix Digital";
    expect(doc.widthOfString(sentence)).toBeLessThan(INVOICE_NOTES_WIDTH);
    doc.end();
  });
});
