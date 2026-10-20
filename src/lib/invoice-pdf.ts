import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { pdfText } from "@/lib/report-pdf";
import { ulixLogoPng } from "@/lib/ulix-logo";

const PAGE_HEIGHT = 792;
const LEFT = 28;
const RIGHT = 584;
const INK = "#333333";
const MUTED = "#6b7280";
const RULE = "#e5e7eb";
const SHADE = "#f9fafb";
const FONT = "DejaVu";
const FONT_BOLD = "DejaVu-Bold";
const PAD = 9;
const HOURS_X = 374;
const PRICE_RIGHT = 504;
const AMOUNT_RIGHT = 575;
const DATE_X = 407;
const TOTAL_GAP = 8;
/** Baseline step for the totals block. 2.5pt looser than the previous 16pt step. */
export const INVOICE_TOTAL_ROW = 18.5;
/** Extra space between note lines, in points. */
export const INVOICE_NOTES_LINE_GAP = 2.5;
/** Space from the Notes label down to the first note line. */
export const INVOICE_NOTES_BODY_GAP = 16.5;
const TITLE_SIZE = 14;
const NAME_SIZE = 10.6;
const SMALL_SIZE = 7.2;
const ADDRESS_SIZE = 7.8;
const BODY_SIZE = 8.3;
/** Wide enough that "to Ulix Digital" stays on one line at the notes size. */
export const INVOICE_NOTES_WIDTH = 380;

export type InvoicePdfLine = {
  title: string;
  detail: string;
  quantity: string;
  unitPrice: string;
  amount: string;
};

export type InvoicePdfTotal = {
  label: string;
  value: string;
  emphasize?: boolean;
};

export type InvoicePdfInput = {
  number: string;
  companyName: string;
  companyAddress: string;
  clientName: string;
  clientAddress: string;
  issueDate: string;
  dueDate: string;
  /** Drawn when the due date has passed and a balance remains. */
  overdue?: boolean;
  /** Draws Status: Paid in the date block. A zero-total issue sets this. */
  paid?: boolean;
  poNumber: string | null;
  lines: InvoicePdfLine[];
  /** Item lines use Qty. Hours lines keep Total hours / (qty). */
  quantityHeader?: "hours" | "item";
  totals: InvoicePdfTotal[];
  notes: string;
  bankDetails: string;
};

export type PdfTrace = {
  text: string;
  x: number;
  y: number;
};

type Doc = InstanceType<typeof PDFDocument>;

export function renderInvoicePdf(
  input: InvoicePdfInput,
  options?: { compress?: boolean; trace?: PdfTrace[] },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      layout: "portrait",
      margin: 0,
      bufferPages: true,
      compress: options?.compress !== false,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      doc.registerFont(FONT, fontFile("DejaVuSans.ttf"));
      doc.registerFont(FONT_BOLD, fontFile("DejaVuSans-Bold.ttf"));
      drawInvoice(doc, cleanInput(input), options?.trace);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function cleanInput(input: InvoicePdfInput): InvoicePdfInput {
  return {
    ...input,
    number: pdfText(input.number),
    companyName: pdfText(input.companyName),
    companyAddress: pdfText(input.companyAddress),
    clientName: pdfText(input.clientName),
    clientAddress: pdfText(input.clientAddress),
    issueDate: pdfText(input.issueDate),
    dueDate: pdfText(input.dueDate),
    poNumber: input.poNumber ? pdfText(input.poNumber) : null,
    notes: pdfText(input.notes),
    bankDetails: pdfText(input.bankDetails),
    lines: input.lines.map((line) => ({
      title: pdfText(line.title),
      detail: pdfText(line.detail),
      quantity: pdfText(line.quantity),
      unitPrice: pdfText(line.unitPrice),
      amount: pdfText(line.amount),
    })),
    totals: input.totals.map((total) => ({
      ...total,
      label: pdfText(total.label),
      value: pdfText(total.value),
    })),
  };
}

function traceText(trace: PdfTrace[] | undefined, text: string, x: number, y: number) {
  if (!trace || !text) return;
  trace.push({ text, x, y });
}

function fontFile(name: string) {
  const candidates = [
    path.join(process.cwd(), "assets/fonts", name),
    path.join(process.cwd(), "..", "assets/fonts", name),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Missing invoice font ${name}.`);
  return found;
}

function drawInvoice(doc: Doc, input: InvoicePdfInput, trace?: PdfTrace[]) {
  doc.fillColor(INK).font(FONT).fontSize(TITLE_SIZE);
  doc.text(`Invoice ${input.number}`, LEFT, 84, { lineBreak: false });
  traceText(trace, `Invoice ${input.number}`, LEFT, 84);
  doc.image(ulixLogoPng, 482, 100, { fit: [90, 28], align: "right" });

  let y = 115;
  doc.font(FONT).fontSize(SMALL_SIZE).fillColor(MUTED);
  doc.text("FROM", LEFT, y, { lineBreak: false });
  traceText(trace, "FROM", LEFT, y);
  y = 130;
  doc.font(FONT).fontSize(NAME_SIZE).fillColor(INK);
  doc.text(input.companyName, LEFT, y, { width: 300, lineBreak: false });
  traceText(trace, input.companyName, LEFT, y);
  y = 145;
  y = drawWrapped(doc, trace, input.companyAddress, LEFT, y, 320, ADDRESS_SIZE, FONT, INK);

  y += 16;
  const toY = y;
  doc.font(FONT).fontSize(SMALL_SIZE).fillColor(MUTED);
  doc.text("TO", LEFT, toY, { lineBreak: false });
  traceText(trace, "TO", LEFT, toY);
  drawDateBlock(doc, trace, input, toY);
  y = toY + 15;
  doc.font(FONT).fontSize(NAME_SIZE).fillColor(INK);
  doc.text(input.clientName, LEFT, y, { width: 300, lineBreak: false });
  traceText(trace, input.clientName, LEFT, y);
  y += 15;
  if (input.clientAddress) {
    y = drawWrapped(doc, trace, input.clientAddress, LEFT, y, 360, ADDRESS_SIZE, FONT, INK);
  }
  y += 38;

  const columns = columnLayout();
  const quantityHeader = input.quantityHeader === "item" ? "item" : "hours";
  y = drawTableHeader(doc, trace, quantityHeader, y);
  for (const line of input.lines) {
    const block = measureLine(doc, line, columns);
    if (y + block > PAGE_HEIGHT - 180) {
      doc.addPage();
      y = 84;
      y = drawTableHeader(doc, trace, quantityHeader, y);
    }
    y = drawLine(doc, trace, line, columns, y);
  }
  rule(doc, y);
  y += 16;

  const notesWidth = Math.min(INVOICE_NOTES_WIDTH, RIGHT - (LEFT + PAD) - totalPairWidth(doc, input.totals) - 16);
  drawNotes(doc, trace, input, y, notesWidth);
  drawTotals(doc, trace, input.totals, y);
}

function drawDateBlock(doc: Doc, trace: PdfTrace[] | undefined, input: InvoicePdfInput, y: number) {
  const rows = [
    ["Issue date:", input.issueDate],
    ["Due date:", input.dueDate],
    ...(input.paid ? [["Status:", "Paid"]] : []),
    ...(input.overdue ? [["Overdue:", "Yes"]] : []),
    ...(input.poNumber ? [["PO number:", input.poNumber]] : []),
  ];
  let cursor = y;
  for (const [label, value] of rows) {
    doc.font(FONT).fontSize(BODY_SIZE).fillColor(MUTED);
    doc.text(label ?? "", DATE_X, cursor, { lineBreak: false });
    traceText(trace, label ?? "", DATE_X, cursor);
    drawRight(doc, trace, value ?? "", RIGHT, cursor, FONT_BOLD, BODY_SIZE, INK);
    cursor += 12;
  }
}

function columnLayout() {
  return {
    description: HOURS_X - LEFT - PAD,
    hoursX: HOURS_X,
    priceRight: PRICE_RIGHT,
    amountRight: AMOUNT_RIGHT,
  };
}

function drawTableHeader(
  doc: Doc,
  trace: PdfTrace[] | undefined,
  quantityHeader: "hours" | "item",
  y: number,
) {
  doc.save();
  doc.rect(LEFT, y, RIGHT - LEFT, 28).fill(SHADE);
  doc.restore();
  doc.rect(LEFT, y + 27, RIGHT - LEFT, 1).fill(RULE);
  doc.font(FONT_BOLD).fontSize(SMALL_SIZE).fillColor(INK);
  if (quantityHeader === "item") {
    doc.text("Qty", HOURS_X, y + 15, { lineBreak: false });
    traceText(trace, "Qty", HOURS_X, y + 15);
  } else {
    doc.text("Total hours", HOURS_X, y + 4, { lineBreak: false });
    traceText(trace, "Total hours", HOURS_X, y + 4);
    doc.text("(qty)", HOURS_X, y + 15, { lineBreak: false });
    traceText(trace, "(qty)", HOURS_X, y + 15);
  }
  doc.text("Description", LEFT + PAD, y + 15, { lineBreak: false });
  traceText(trace, "Description", LEFT + PAD, y + 15);
  drawRight(doc, trace, "Unit price", PRICE_RIGHT, y + 15, FONT_BOLD, SMALL_SIZE, INK);
  drawRight(doc, trace, "Amount", AMOUNT_RIGHT, y + 15, FONT_BOLD, SMALL_SIZE, INK);
  return y + 42;
}

function measureLine(doc: Doc, line: InvoicePdfLine, columns: ReturnType<typeof columnLayout>) {
  doc.font(FONT).fontSize(SMALL_SIZE);
  const detail = line.detail ? doc.heightOfString(line.detail, { width: columns.description - 8 }) : 0;
  return 14 + detail + 4;
}

function drawLine(
  doc: Doc,
  trace: PdfTrace[] | undefined,
  line: InvoicePdfLine,
  columns: ReturnType<typeof columnLayout>,
  y: number,
) {
  doc.font(FONT_BOLD).fontSize(SMALL_SIZE).fillColor(INK);
  doc.text(line.title, LEFT + PAD, y, {
    width: columns.description - 8,
    lineBreak: false,
  });
  traceText(trace, line.title, LEFT + PAD, y);
  let next = y + 12;
  if (line.detail) {
    doc.font(FONT).fontSize(SMALL_SIZE).fillColor(MUTED);
    doc.text(line.detail, LEFT + PAD, next, { width: columns.description - 8 });
    traceText(trace, line.detail, LEFT + PAD, next);
    next += doc.heightOfString(line.detail, { width: columns.description - 8 });
  }
  doc.font(FONT).fontSize(SMALL_SIZE).fillColor(INK);
  doc.text(line.quantity, HOURS_X, y, { lineBreak: false });
  traceText(trace, line.quantity, HOURS_X, y);
  drawRight(doc, trace, line.unitPrice, PRICE_RIGHT, y, FONT, SMALL_SIZE, INK);
  drawRight(doc, trace, line.amount, AMOUNT_RIGHT, y, FONT, SMALL_SIZE, INK);
  return next + 4;
}

function drawNotes(doc: Doc, trace: PdfTrace[] | undefined, input: InvoicePdfInput, y: number, width: number) {
  doc.font(FONT).fontSize(BODY_SIZE).fillColor(INK);
  doc.text("Notes", LEFT + PAD, y, { lineBreak: false });
  traceText(trace, "Notes", LEFT + PAD, y);
  const body = [input.notes, input.bankDetails].filter(Boolean).join("\n\n");
  if (!body) return;
  drawWrapped(doc, trace, body, LEFT + PAD, y + INVOICE_NOTES_BODY_GAP, width, BODY_SIZE, FONT, INK, INVOICE_NOTES_LINE_GAP);
}

function totalMetrics(doc: Doc, totals: InvoicePdfTotal[]) {
  return totals.map((total) => {
    const valueFont = total.emphasize ? FONT_BOLD : FONT;
    doc.font(FONT_BOLD).fontSize(SMALL_SIZE);
    const labelWidth = doc.widthOfString(total.label);
    doc.font(valueFont).fontSize(SMALL_SIZE);
    const valueWidth = doc.widthOfString(total.value);
    return { total, labelWidth, valueWidth, valueFont };
  });
}

function totalPairWidth(doc: Doc, totals: InvoicePdfTotal[]) {
  const metrics = totalMetrics(doc, totals);
  const maxLabel = Math.max(0, ...metrics.map((metric) => metric.labelWidth));
  const maxValue = Math.max(0, ...metrics.map((metric) => metric.valueWidth));
  return maxLabel + TOTAL_GAP + maxValue;
}

function drawTotals(doc: Doc, trace: PdfTrace[] | undefined, totals: InvoicePdfTotal[], y: number) {
  const metrics = totalMetrics(doc, totals);
  const maxValue = Math.max(0, ...metrics.map((metric) => metric.valueWidth));
  const labelRight = AMOUNT_RIGHT - maxValue - TOTAL_GAP;
  let cursor = y;
  for (const metric of metrics) {
    const valueX = AMOUNT_RIGHT - metric.valueWidth;
    const labelX = labelRight - metric.labelWidth;
    if (metric.total.emphasize) {
      doc.save();
      doc.rect(labelX - 6, cursor - 3, AMOUNT_RIGHT - labelX + 10, INVOICE_TOTAL_ROW).fill(SHADE);
      doc.restore();
    }
    doc.font(FONT_BOLD).fontSize(SMALL_SIZE).fillColor(INK);
    doc.text(metric.total.label, labelX, cursor, { lineBreak: false });
    traceText(trace, metric.total.label, labelX, cursor);
    doc.font(metric.valueFont).fontSize(SMALL_SIZE).fillColor(INK);
    doc.text(metric.total.value, valueX, cursor, { lineBreak: false });
    traceText(trace, metric.total.value, valueX, cursor);
    cursor += INVOICE_TOTAL_ROW;
  }
}

function drawRight(
  doc: Doc,
  trace: PdfTrace[] | undefined,
  text: string,
  right: number,
  y: number,
  font: string,
  size: number,
  color: string,
) {
  doc.font(font).fontSize(size).fillColor(color);
  const x = right - doc.widthOfString(text);
  doc.text(text, x, y, { lineBreak: false });
  traceText(trace, text, x, y);
}

function drawWrapped(
  doc: Doc,
  trace: PdfTrace[] | undefined,
  value: string,
  x: number,
  y: number,
  width: number,
  size: number,
  font: string,
  color: string,
  lineGap = 0,
) {
  doc.font(font).fontSize(size).fillColor(color);
  const options = { width, lineGap };
  doc.text(value, x, y, options);
  let cursor = y;
  const paragraphs = value.split("\n");
  for (const paragraph of paragraphs) {
    if (paragraph) traceText(trace, paragraph, x, cursor);
    const sample = paragraph || " ";
    cursor += doc.heightOfString(sample, { width, lineGap });
  }
  return y + doc.heightOfString(value, options);
}

function rule(doc: Doc, y: number) {
  doc.save();
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(1).strokeColor(RULE).stroke();
  doc.restore();
}

type PdfMatrix = { a: number; b: number; c: number; d: number; e: number; f: number };

function identityMatrix(): PdfMatrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

/** `cm` concatenates on the left: the operand is applied before the current matrix. */
function concatMatrix(current: PdfMatrix, next: PdfMatrix): PdfMatrix {
  return {
    a: next.a * current.a + next.c * current.b,
    b: next.b * current.a + next.d * current.b,
    c: next.a * current.c + next.c * current.d,
    d: next.b * current.c + next.d * current.d,
    e: next.a * current.e + next.c * current.f + next.e,
    f: next.b * current.e + next.d * current.f + next.f,
  };
}

function applyMatrix(matrix: PdfMatrix, x: number, y: number) {
  return {
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  };
}

/**
 * Text from an uncompressed pdfkit invoice. y is measured from the top of US Letter.
 * pdfkit writes hex `TJ` strings and flips the page, then flips again inside each text block.
 */
export function pdfTextPositions(buffer: Buffer) {
  const raw = buffer.toString("latin1");
  const fonts = fontUnicodeMaps(raw);
  const found: Array<{ text: string; x: number; yFromTop: number }> = [];
  for (const match of raw.matchAll(/stream\n([\s\S]*?)endstream/g)) {
    const stream = match[1] ?? "";
    if (!/\/F\d+\s/.test(stream) || !stream.includes("TJ")) continue;
    found.push(...readPdfTextStream(stream, fonts));
  }
  return found;
}

function objectIdBefore(raw: string, index: number) {
  const matches = [...raw.slice(0, index).matchAll(/(\d+)\s+0\s+obj/g)];
  return matches.at(-1)?.[1] ?? "";
}

function fontUnicodeMaps(raw: string) {
  const cmaps = new Map<string, Map<number, string>>();
  for (const match of raw.matchAll(/beginbfrange([\s\S]*?)endcmap/g)) {
    cmaps.set(objectIdBefore(raw, match.index ?? 0), parseToUnicode(match[1] ?? ""));
  }
  const byFontObject = new Map<string, Map<number, string>>();
  for (const match of raw.matchAll(/\/ToUnicode\s+(\d+)\s+0\s+R/g)) {
    const map = cmaps.get(match[1] ?? "");
    if (map) byFontObject.set(objectIdBefore(raw, match.index ?? 0), map);
  }
  const fonts = new Map<string, Map<number, string>>();
  for (const block of raw.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) {
    for (const ref of (block[1] ?? "").matchAll(/\/(F\d+)\s+(\d+)\s+0\s+R/g)) {
      const map = byFontObject.get(ref[2] ?? "");
      if (map) fonts.set(ref[1] ?? "", map);
    }
  }
  return fonts;
}

function parseToUnicode(stream: string) {
  const map = new Map<number, string>();
  const pattern = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([\s\S]*?)\])/g;
  for (const match of stream.matchAll(pattern)) {
    const start = Number.parseInt(match[1] ?? "", 16);
    const end = Number.parseInt(match[2] ?? "", 16);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    if (match[3]) {
      let dest = Number.parseInt(match[3], 16);
      for (let code = start; code <= end; code += 1) {
        map.set(code, String.fromCodePoint(dest));
        dest += 1;
      }
      continue;
    }
    const dests = [...(match[4] ?? "").matchAll(/<([0-9A-Fa-f]+)>/g)].map((item) =>
      Number.parseInt(item[1] ?? "", 16),
    );
    dests.forEach((dest, index) => {
      if (!Number.isNaN(dest)) map.set(start + index, String.fromCodePoint(dest));
    });
  }
  return map;
}

function readPdfTextStream(stream: string, fonts: Map<string, Map<number, string>>) {
  const found: Array<{ text: string; x: number; yFromTop: number }> = [];
  let ctm = identityMatrix();
  const stack: PdfMatrix[] = [];
  let textX = 0;
  let textY = 0;
  let font = "";
  const pattern =
    /\bq\b|\bQ\b|\/(F\d+)\s+[0-9.]+\s+Tf|([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?(?:\s+[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?){5})\s+(cm|Tm)|\[([\s\S]*?)\]\s*TJ/g;
  for (const token of stream.matchAll(pattern)) {
    if (token[0] === "q") {
      stack.push(ctm);
      continue;
    }
    if (token[0] === "Q") {
      ctm = stack.pop() ?? identityMatrix();
      continue;
    }
    if (token[1]) {
      font = token[1];
      continue;
    }
    const body = token[4];
    if (body !== undefined) {
      let text = "";
      const map = fonts.get(font);
      for (const hex of body.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
        text += map ? decodeGlyphs(hex[1] ?? "", map) : decodePdfHex(hex[1] ?? "");
      }
      if (!text) continue;
      const point = applyMatrix(ctm, textX, textY);
      found.push({ text, x: point.x, yFromTop: PAGE_HEIGHT - point.y });
      continue;
    }
    const numbers = (token[2] ?? "").trim().split(/\s+/).map(Number);
    if (numbers.length !== 6 || numbers.some((value) => Number.isNaN(value))) continue;
    const matrix = {
      a: numbers[0] ?? 1,
      b: numbers[1] ?? 0,
      c: numbers[2] ?? 0,
      d: numbers[3] ?? 1,
      e: numbers[4] ?? 0,
      f: numbers[5] ?? 0,
    };
    if (token[3] === "cm") {
      ctm = concatMatrix(ctm, matrix);
      continue;
    }
    textX = matrix.e;
    textY = matrix.f;
  }
  return found;
}

function decodeGlyphs(value: string, map: Map<number, string>) {
  const hex = value.replaceAll(/\s/g, "");
  let text = "";
  for (let index = 0; index + 4 <= hex.length; index += 4) {
    text += map.get(Number.parseInt(hex.slice(index, index + 4), 16)) ?? "";
  }
  return text;
}

function decodePdfHex(value: string) {
  const hex = value.replaceAll(/\s/g, "");
  if (hex.length < 2 || hex.length % 2 !== 0) return "";
  let text = "";
  for (let index = 0; index < hex.length; index += 2) {
    text += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  return text;
}

export function referenceInvoicePdfInput(bankDetails: string): InvoicePdfInput {
  return {
    number: "LE1175",
    companyName: "Ulix Digital",
    companyAddress: "30 North Gould Street, Sheridan, WY 82801",
    clientName: "WSI Web Enhancers",
    clientAddress: "4801 Lang Ave NE Suite 110, Albuquerque, NM 87109",
    issueDate: "Mon, Oct 12, 2026",
    dueDate: "Mon, Oct 19, 2026",
    poNumber: null,
    lines: [
      {
        title: "Weekly Invoice",
        detail: "Mon, Oct 5, 2026 - Sun, Oct 11, 2026",
        quantity: "26:22:12",
        unitPrice: "$25.00",
        amount: "$659.25",
      },
    ],
    totals: [
      { label: "Subtotal", value: "$659.25" },
      { label: "Total", value: "$659.25" },
      { label: "Paid", value: "$0.00" },
      { label: "Amount due", value: "$659.25", emphasize: true },
    ],
    notes: "* All payments are non refundable\n* Use these details to send both Domestic wires and ACH transfers to Ulix Digital",
    bankDetails,
  };
}
