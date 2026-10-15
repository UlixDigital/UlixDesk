import PDFDocument from "pdfkit";
import type { BuiltReport } from "@/lib/reports";
import { timeChangeCopy } from "@/lib/time-change-copy";
import type { TimeChangeView } from "@/lib/time-change-display";
import { ulixLogoPng } from "@/lib/ulix-logo";

const INK = "#1d1d1d";
const ACCENT = "#1f108c";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const HEADER_BG = "#edf6ff";
const MARGIN = 40;
const FOOTER = 28;

export type PdfColumn = { label: string; align: "left" | "right" };

export type PdfTable = {
  columns: PdfColumn[];
  rows: string[][];
  totals: string[] | null;
};

export type PdfBlock = {
  title: string;
  meta: string;
  lines: string[];
};

export type PdfReportInput = {
  title: string;
  filters: string[];
  table?: PdfTable | null;
  blocks?: PdfBlock[] | null;
  empty?: string | null;
  /** Tests turn compression off so the totals can be read back as text. */
  compress?: boolean;
};

type Doc = InstanceType<typeof PDFDocument>;

/** Pull the painted strings out of an uncompressed PDF. */
export function pdfPlainText(buffer: Buffer) {
  const raw = buffer.toString("latin1");
  const parts: string[] = [];
  for (const match of raw.matchAll(/<([0-9A-Fa-f \n\r]+)>/g)) {
    const hex = match[1].replaceAll(/\s/g, "");
    if (hex.length < 2 || hex.length % 2 !== 0) continue;
    let text = "";
    for (let index = 0; index < hex.length; index += 2) {
      text += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
    }
    parts.push(text);
  }
  return parts.join("");
}

export function renderReportPdf(input: PdfReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const wide = (input.table?.columns.length ?? 0) >= 7;
    const doc = new PDFDocument({
      size: wide ? "LETTER" : "A4",
      layout: wide ? "landscape" : "portrait",
      margin: MARGIN,
      bufferPages: true,
      compress: input.compress !== false,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      drawReport(doc, cleanPdfInput(input));
      stampPageNumbers(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function contentBottom(doc: Doc) {
  return doc.page.height - MARGIN - FOOTER;
}

function contentWidth(doc: Doc) {
  return doc.page.width - MARGIN * 2;
}

function drawReport(doc: Doc, input: PdfReportInput) {
  drawFirstHeader(doc, input);
  if (input.table && input.table.columns.length > 0 && input.table.rows.length > 0) {
    drawTable(doc, input.title, input.table);
    return;
  }
  if (input.blocks && input.blocks.length > 0) {
    drawBlocks(doc, input.title, input.blocks);
    return;
  }
  doc.font("Helvetica").fontSize(11).fillColor(INK).text(input.empty ?? "", {
    width: contentWidth(doc),
  });
}

function drawBrandBar(doc: Doc, y: number) {
  const width = contentWidth(doc);
  const gradient = doc.linearGradient(MARGIN, y, MARGIN + width, y);
  gradient
    .stop(0, "#1f108c")
    .stop(0.32, "#1f2dac")
    .stop(0.58, "#2053d7")
    .stop(0.78, "#2067ed")
    .stop(1, "#2177ff");
  doc.save();
  doc.rect(MARGIN, y, width, 3).fill(gradient);
  doc.restore();
}

function drawFirstHeader(doc: Doc, input: PdfReportInput) {
  doc.image(ulixLogoPng, MARGIN, MARGIN, { height: 26 });
  const barY = MARGIN + 32;
  drawBrandBar(doc, barY);
  const width = contentWidth(doc);
  doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(16);
  doc.text(input.title, MARGIN, barY + 12, { width });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  for (const line of input.filters) {
    doc.text(line, { width });
  }
  doc.moveDown(0.7);
}

function drawContinuedHeader(doc: Doc, title: string) {
  doc.image(ulixLogoPng, MARGIN, MARGIN, { height: 18 });
  drawBrandBar(doc, MARGIN + 22);
  doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(11);
  doc.text(title, MARGIN, MARGIN + 30, { width: contentWidth(doc) });
  doc.moveDown(0.4);
}

function newPage(doc: Doc, title: string) {
  doc.addPage();
  drawContinuedHeader(doc, title);
}

/** Amount columns keep the width of their header and widest value so a total stays on one line. */
function columnWidths(
  doc: Doc,
  columns: PdfColumn[],
  rows: string[][],
  totals: string[] | null,
  total: number,
) {
  const sample = rows.slice(0, 40);
  const preferred = columns.map((column, index) => {
    doc.font("Helvetica-Bold").fontSize(8);
    let width = doc.widthOfString(column.label);
    const values = sample.map((row) => row[index] ?? "");
    if (totals) values.push(totals[index] ?? "");
    for (const value of values) {
      doc.font(column.align === "right" ? "Helvetica-Bold" : "Helvetica").fontSize(8);
      width = Math.max(width, doc.widthOfString(value));
    }
    return Math.ceil(width) + 10;
  });
  const sum = preferred.reduce((acc, width) => acc + width, 0);
  if (sum <= total) {
    const flex = columns
      .map((column, index) => (column.align === "left" ? index : -1))
      .filter((index) => index >= 0);
    const targets = flex.length > 0 ? flex : columns.map((_, index) => index);
    const extra = (total - sum) / targets.length;
    return preferred.map((width, index) => (targets.includes(index) ? width + extra : width));
  }
  const rightSum = preferred.reduce(
    (acc, width, index) => acc + (columns[index]?.align === "right" ? width : 0),
    0,
  );
  const leftSum = sum - rightSum;
  if (rightSum >= total || leftSum <= 0) {
    const scale = total / sum;
    return preferred.map((width) => width * scale);
  }
  const scale = (total - rightSum) / leftSum;
  return preferred.map((width, index) => (columns[index]?.align === "right" ? width : width * scale));
}

function drawTable(doc: Doc, title: string, table: PdfTable) {
  const widths = columnWidths(doc, table.columns, table.rows, table.totals, contentWidth(doc));
  let y = drawTableHeader(doc, table.columns, widths, doc.y);
  for (const row of table.rows) {
    const height = measureRow(doc, table.columns, row, widths, false);
    if (y + height > contentBottom(doc)) {
      newPage(doc, title);
      y = drawTableHeader(doc, table.columns, widths, doc.y);
    }
    y = drawRow(doc, table.columns, row, widths, y, height, false);
  }
  if (!table.totals) {
    doc.y = y;
    return;
  }
  const height = measureRow(doc, table.columns, table.totals, widths, true);
  if (y + height > contentBottom(doc)) {
    newPage(doc, title);
    y = drawTableHeader(doc, table.columns, widths, doc.y);
  }
  doc.y = drawRow(doc, table.columns, table.totals, widths, y, height, true);
}

function drawTableHeader(doc: Doc, columns: PdfColumn[], widths: number[], y: number) {
  const height = 18;
  doc.save();
  doc.rect(MARGIN, y, contentWidth(doc), height).fill(HEADER_BG);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(ACCENT);
  let x = MARGIN;
  columns.forEach((column, index) => {
    doc.text(column.label, x + 3, y + 5, {
      width: Math.max(widths[index] - 6, 8),
      align: column.align,
      lineBreak: false,
      height: 12,
    });
    x += widths[index];
  });
  return y + height;
}

function measureRow(doc: Doc, columns: PdfColumn[], cells: string[], widths: number[], total: boolean) {
  doc.font(total ? "Helvetica-Bold" : "Helvetica").fontSize(8);
  let height = 16;
  cells.forEach((cell, index) => {
    if (columns[index]?.align === "right") return;
    const textHeight = doc.heightOfString(cell || " ", {
      width: Math.max((widths[index] ?? 40) - 6, 8),
    });
    height = Math.max(height, textHeight + 8);
  });
  return height;
}

function drawRow(
  doc: Doc,
  columns: PdfColumn[],
  cells: string[],
  widths: number[],
  y: number,
  height: number,
  total: boolean,
) {
  doc.save();
  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + contentWidth(doc), y)
    .strokeColor(total ? ACCENT : LINE)
    .lineWidth(total ? 1 : 0.4)
    .stroke();
  doc.restore();
  doc.font(total ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor(INK);
  let x = MARGIN;
  cells.forEach((cell, index) => {
    const align = columns[index]?.align ?? "left";
    doc.text(cell, x + 3, y + 4, {
      width: Math.max((widths[index] ?? 40) - 6, 8),
      align,
      height: Math.max(height - 6, 8),
      lineBreak: align === "right" ? false : undefined,
    });
    x += widths[index] ?? 0;
  });
  return y + height;
}

function drawBlocks(doc: Doc, title: string, blocks: PdfBlock[]) {
  const width = contentWidth(doc);
  for (const block of blocks) {
    doc.font("Helvetica-Bold").fontSize(10);
    const titleHeight = doc.heightOfString(block.title, { width });
    if (doc.y + titleHeight + 28 > contentBottom(doc)) newPage(doc, title);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(block.title, { width });
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(block.meta, { width });
    doc.moveDown(0.2);
    for (const line of block.lines) {
      doc.font("Helvetica").fontSize(8);
      const lineHeight = doc.heightOfString(line, { width });
      if (doc.y + lineHeight > contentBottom(doc)) newPage(doc, title);
      doc.fillColor(INK).text(line, { width });
    }
    doc.moveDown(0.6);
  }
}

const WIN_ANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

/** Helvetica is WinAnsi. Keep those characters and swap the rest for ASCII. */
export function pdfText(value: string) {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x2192) {
      out += "->";
      continue;
    }
    if (code === 0x202f || code === 0x2009 || code === 0x00a0 || code === 0x09) {
      out += " ";
      continue;
    }
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(code)) {
      out += char;
      continue;
    }
    if (code === 0x0a) {
      out += "\n";
      continue;
    }
    out += "?";
  }
  return out;
}

function cleanPdfInput(input: PdfReportInput): PdfReportInput {
  return {
    ...input,
    title: pdfText(input.title),
    filters: input.filters.map(pdfText),
    empty: input.empty == null ? input.empty : pdfText(input.empty),
    table: input.table
      ? {
          columns: input.table.columns.map((column) => ({ ...column, label: pdfText(column.label) })),
          rows: input.table.rows.map((row) => row.map(pdfText)),
          totals: input.table.totals ? input.table.totals.map(pdfText) : null,
        }
      : input.table,
    blocks: input.blocks
      ? input.blocks.map((block) => ({
          title: pdfText(block.title),
          meta: pdfText(block.meta),
          lines: block.lines.map(pdfText),
        }))
      : input.blocks,
  };
}

function amountAlign(id: string): "left" | "right" {
  return id === "amount" || id === "noAmount" || id.startsWith("amount:") ? "right" : "left";
}

/** Screen cells, including the formatted amounts and the per-currency total row. */
export function builtReportToTable(report: BuiltReport): PdfTable | null {
  if (report.columns.length === 0 || report.rows.length === 0) return null;
  return {
    columns: report.columns.map((column) => ({
      label: column.label,
      align: amountAlign(column.id),
    })),
    rows: report.rows.map((row) => report.columns.map((column) => row.cells[column.id] ?? "")),
    totals: report.totals
      ? report.columns.map((column) => report.totals?.[column.id] ?? "")
      : null,
  };
}

/** The same fields as the time edit list. Before and after are joined with an arrow. */
export function timeChangesToBlocks(items: TimeChangeView[]): PdfBlock[] {
  return items.map((item) => ({
    title: item.byline,
    meta: `${item.whenLabel} · ${item.actionLabel} · ${item.sourceLabel}`,
    lines: [
      ...(item.unchanged ? [timeChangeCopy.unchanged] : []),
      ...item.fields.map((field) =>
        field.changed ? `${field.label}: ${field.before} → ${field.after}` : `${field.label}: ${field.after}`,
      ),
    ],
  }));
}

function stampPageNumbers(doc: Doc) {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    // The number sits in the bottom margin. Leaving the margin in place makes
    // pdfkit open a page that contains only the number.
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(8).fillColor(MUTED);
    doc.text(`Page ${index + 1} of ${range.count}`, MARGIN, doc.page.height - 24, {
      width: contentWidth(doc),
      align: "right",
      lineBreak: false,
      height: 12,
    });
  }
}
