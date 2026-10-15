import PDFDocument from "pdfkit";
import { pdfText } from "@/lib/report-pdf";
import { ulixLogoPng } from "@/lib/ulix-logo";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 40;
const INK = "#333333";
const MUTED = "#6b7280";
const RULE = "#e5e7eb";
const SHADE = "#f9fafb";
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN;

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
  poNumber: string | null;
  lines: InvoicePdfLine[];
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

function drawInvoice(doc: Doc, input: InvoicePdfInput, trace?: PdfTrace[]) {
  let y = 48;
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(18);
  doc.text(`Invoice ${input.number}`, MARGIN, y, { lineBreak: false });
  traceText(trace, `Invoice ${input.number}`, MARGIN, y);
  doc.image(ulixLogoPng, CONTENT_RIGHT - 150, 42, { fit: [150, 42], align: "right" });

  y = 108;
  const dateRows = [
    ["Issue date:", input.issueDate],
    ["Due date:", input.dueDate],
    ...(input.poNumber ? [["PO number:", input.poNumber]] : []),
  ];
  let dateY = y;
  for (const [label, value] of dateRows) {
    doc.font("Helvetica").fontSize(10).fillColor(MUTED);
    doc.text(label ?? "", 360, dateY, { lineBreak: false });
    traceText(trace, label ?? "", 360, dateY);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK);
    const width = doc.widthOfString(value ?? "");
    doc.text(value ?? "", CONTENT_RIGHT - width, dateY, { lineBreak: false });
    traceText(trace, value ?? "", CONTENT_RIGHT - width, dateY);
    dateY += 16;
  }

  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  doc.text("FROM", MARGIN, y, { lineBreak: false });
  traceText(trace, "FROM", MARGIN, y);
  y += 14;
  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK);
  doc.text(input.companyName, MARGIN, y, { width: 280, lineBreak: false });
  traceText(trace, input.companyName, MARGIN, y);
  y += 18;
  y = drawWrapped(doc, trace, input.companyAddress, MARGIN, y, 280, 10, "Helvetica", INK);

  y += 16;
  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  doc.text("TO", MARGIN, y, { lineBreak: false });
  traceText(trace, "TO", MARGIN, y);
  y += 14;
  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK);
  doc.text(input.clientName, MARGIN, y, { width: 280, lineBreak: false });
  traceText(trace, input.clientName, MARGIN, y);
  y += 18;
  if (input.clientAddress) {
    y = drawWrapped(doc, trace, input.clientAddress, MARGIN, y, 280, 10, "Helvetica", INK);
  }
  y = Math.max(y, dateY) + 22;

  const columns = columnLayout();
  y = drawTableHeader(doc, trace, columns, y);
  for (const line of input.lines) {
    const block = measureLine(doc, line, columns);
    if (y + block > PAGE_HEIGHT - 180) {
      doc.addPage();
      y = 48;
      y = drawTableHeader(doc, trace, columns, y);
    }
    y = drawLine(doc, trace, line, columns, y);
  }
  rule(doc, y);
  y += 18;

  const totalsTop = y;
  drawNotes(doc, trace, input, y);
  drawTotals(doc, trace, input.totals, totalsTop);
}

function columnLayout() {
  const width = CONTENT_RIGHT - MARGIN;
  const amount = 78;
  const price = 78;
  const hours = 88;
  const description = width - amount - price - hours;
  return {
    description,
    hours,
    price,
    amount,
    x: [MARGIN, MARGIN + description, MARGIN + description + hours, MARGIN + description + hours + price],
  };
}

function drawTableHeader(
  doc: Doc,
  trace: PdfTrace[] | undefined,
  columns: ReturnType<typeof columnLayout>,
  y: number,
) {
  doc.save();
  doc.rect(MARGIN, y, CONTENT_RIGHT - MARGIN, 28).fill(SHADE);
  doc.restore();
  doc.rect(MARGIN, y + 27, CONTENT_RIGHT - MARGIN, 1).fill(RULE);
  const labels = ["Description", "Total hours (qty)", "Unit price", "Amount"];
  labels.forEach((label, index) => {
    const x = columns.x[index] ?? MARGIN;
    const columnWidth = [columns.description, columns.hours, columns.price, columns.amount][index] ?? 40;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(INK);
    if (index === 0) {
      doc.text(label, x + 8, y + 10, { lineBreak: false });
      traceText(trace, label, x + 8, y + 10);
      return;
    }
    const textWidth = doc.widthOfString(label);
    doc.text(label, x + columnWidth - textWidth - 8, y + 10, { lineBreak: false });
    traceText(trace, label, x + columnWidth - textWidth - 8, y + 10);
  });
  return y + 36;
}

function measureLine(doc: Doc, line: InvoicePdfLine, columns: ReturnType<typeof columnLayout>) {
  doc.font("Helvetica").fontSize(9);
  const detail = line.detail ? doc.heightOfString(line.detail, { width: columns.description - 16 }) : 0;
  return 16 + detail + 12;
}

function drawLine(
  doc: Doc,
  trace: PdfTrace[] | undefined,
  line: InvoicePdfLine,
  columns: ReturnType<typeof columnLayout>,
  y: number,
) {
  doc.font("Helvetica-Bold").fontSize(11).fillColor(INK);
  doc.text(line.title, (columns.x[0] ?? MARGIN) + 8, y, {
    width: columns.description - 16,
    lineBreak: false,
  });
  traceText(trace, line.title, (columns.x[0] ?? MARGIN) + 8, y);
  let next = y + 16;
  if (line.detail) {
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    doc.text(line.detail, (columns.x[0] ?? MARGIN) + 8, next, { width: columns.description - 16 });
    traceText(trace, line.detail, (columns.x[0] ?? MARGIN) + 8, next);
    next += doc.heightOfString(line.detail, { width: columns.description - 16 });
  }
  const values = [line.quantity, line.unitPrice, line.amount];
  const widths = [columns.hours, columns.price, columns.amount];
  values.forEach((value, index) => {
    const x = columns.x[index + 1] ?? MARGIN;
    const columnWidth = widths[index] ?? 40;
    doc.font("Helvetica").fontSize(10).fillColor(INK);
    const textWidth = doc.widthOfString(value);
    doc.text(value, x + columnWidth - textWidth - 8, y, { lineBreak: false });
    traceText(trace, value, x + columnWidth - textWidth - 8, y);
  });
  return next + 12;
}

function drawNotes(doc: Doc, trace: PdfTrace[] | undefined, input: InvoicePdfInput, y: number) {
  doc.font("Helvetica-Bold").fontSize(10).fillColor(INK);
  doc.text("Notes", MARGIN, y, { lineBreak: false });
  traceText(trace, "Notes", MARGIN, y);
  const body = [input.notes, input.bankDetails].filter(Boolean).join("\n\n");
  if (!body) return;
  drawWrapped(doc, trace, body, MARGIN, y + 16, 300, 9, "Helvetica", INK);
}

function drawTotals(doc: Doc, trace: PdfTrace[] | undefined, totals: InvoicePdfTotal[], y: number) {
  let cursor = y;
  for (const total of totals) {
    if (total.emphasize) {
      doc.save();
      doc.rect(348, cursor - 4, CONTENT_RIGHT - 348, 20).fill(SHADE);
      doc.restore();
    }
    const font = total.emphasize ? "Helvetica-Bold" : "Helvetica";
    doc.font(font).fontSize(10).fillColor(INK);
    doc.text(total.label, 360, cursor, { lineBreak: false });
    traceText(trace, total.label, 360, cursor);
    const width = doc.widthOfString(total.value);
    doc.text(total.value, CONTENT_RIGHT - width, cursor, { lineBreak: false });
    traceText(trace, total.value, CONTENT_RIGHT - width, cursor);
    cursor += 18;
  }
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
) {
  doc.font(font).fontSize(size).fillColor(color);
  doc.text(value, x, y, { width });
  traceText(trace, value.split("\n")[0] ?? value, x, y);
  return y + doc.heightOfString(value, { width });
}

function rule(doc: Doc, y: number) {
  doc.save();
  doc.moveTo(MARGIN, y).lineTo(CONTENT_RIGHT, y).lineWidth(1).strokeColor(RULE).stroke();
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
  const found: Array<{ text: string; x: number; yFromTop: number }> = [];
  for (const match of raw.matchAll(/stream\n([\s\S]*?)endstream/g)) {
    const stream = match[1] ?? "";
    if (!stream.includes("/F1") && !stream.includes("/F2")) continue;
    found.push(...readPdfTextStream(stream));
  }
  return found;
}

function readPdfTextStream(stream: string) {
  const found: Array<{ text: string; x: number; yFromTop: number }> = [];
  let ctm = identityMatrix();
  const stack: PdfMatrix[] = [];
  let textX = 0;
  let textY = 0;
  const pattern =
    /\bq\b|\bQ\b|([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?(?:\s+[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?){5})\s+(cm|Tm)|\[([\s\S]*?)\]\s*TJ/g;
  for (const token of stream.matchAll(pattern)) {
    if (token[0] === "q") {
      stack.push(ctm);
      continue;
    }
    if (token[0] === "Q") {
      ctm = stack.pop() ?? identityMatrix();
      continue;
    }
    const body = token[3];
    if (body !== undefined) {
      let text = "";
      for (const hex of body.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
        text += decodePdfHex(hex[1] ?? "");
      }
      if (!text) continue;
      const point = applyMatrix(ctm, textX, textY);
      found.push({ text, x: point.x, yFromTop: PAGE_HEIGHT - point.y });
      continue;
    }
    const numbers = (token[1] ?? "").trim().split(/\s+/).map(Number);
    if (numbers.length !== 6 || numbers.some((value) => Number.isNaN(value))) continue;
    const matrix = {
      a: numbers[0] ?? 1,
      b: numbers[1] ?? 0,
      c: numbers[2] ?? 0,
      d: numbers[3] ?? 1,
      e: numbers[4] ?? 0,
      f: numbers[5] ?? 0,
    };
    if (token[2] === "cm") {
      ctm = concatMatrix(ctm, matrix);
      continue;
    }
    textX = matrix.e;
    textY = matrix.f;
  }
  return found;
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
