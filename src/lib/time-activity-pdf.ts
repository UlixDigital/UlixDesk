import PDFDocument from "pdfkit";
import { minorDigits } from "@/lib/currencies";
import type { MoneyTotal } from "@/lib/money";
import { sumMoney } from "@/lib/money";
import { reportCopy } from "@/lib/report-copy";
import { pdfText } from "@/lib/report-pdf";
import { formatCivilDate } from "@/lib/time-zone";
import { ulixLogoPng } from "@/lib/ulix-logo";

const INK = "#1d1d1d";
const MUTED = "#64748b";
const RULE = "#cbd5e1";
const LINE = "#e5e7eb";
const GREY = "#f3f4f6";
const HEADER_BG = "#f8fafc";
const MARGIN = 36;
const FOOTER_TOP = 40;

const SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  NZD: "NZ$",
};

export type ActivityLine = {
  clientName: string;
  date: string;
  memberName: string;
  projectName: string;
  durationMs: number;
  billableMs: number;
  amount: MoneyTotal | null;
  note: string;
  manual: boolean;
  edited: boolean;
};

export type ActivityDetail = {
  id: string;
  todo: string;
  missingTodo: boolean;
  time: string;
  billed: string;
  billable: string;
  notes: string;
};

export type ActivityGroup = {
  id: string;
  dateLabel: string;
  memberName: string;
  time: string;
  billed: string;
  billable: string;
  details: ActivityDetail[];
};

export type ActivityClient = {
  name: string;
  time: string;
  billed: string;
  billable: string;
  groups: ActivityGroup[];
};

export type ActivityModel = {
  title: string;
  dateRange: string;
  /** Narrowed filters only. Empty when the PDF is the whole workspace for the dates. */
  filterSummary: string;
  timeZone: string;
  organization: string;
  showMoney: boolean;
  grand: { time: string; billed: string; billable: string };
  clients: ActivityClient[];
};

export type ActivitySlice =
  | { type: "heading"; client: string; continued: boolean; height: number }
  | { type: "columns"; height: number }
  | { type: "group"; id: string; continued: boolean; height: number }
  | { type: "detail"; id: string; height: number }
  | { type: "total"; client: string; height: number };

type SectionMeasure = {
  client: string;
  heading: number;
  columns: number;
  groups: Array<{ id: string; height: number; details: Array<{ id: string; height: number }> }>;
  total: number;
};

/** Clock time with unpadded hours: 0:05:22, 10:00:00. */
export function formatActivityDuration(ms: number) {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** The timesheet draws this em dash, with the accessible name "No amount". */
export const activityNoAmount = "—";

/** One note row stays on the page. Longer text is cut here. */
export const ACTIVITY_NOTES_MAX = 300;

/**
 * One line per currency, in the currency's own symbol and decimals.
 * An empty list is blank. Callers add the no-amount mark themselves.
 * USD is $723.22. JPY stays ¥1,500. An explicit zero is $0.00 or ¥0.
 */
export function formatActivityMoney(totals: MoneyTotal[]) {
  return totals.map(formatOneMoney).join("\n");
}

export function formatActivityDate(date: string) {
  return formatCivilDate(date, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatActivityRange(from: string, to: string) {
  return `${formatActivityDate(from)} - ${formatActivityDate(to)}`;
}

export function buildTimeActivityModel(input: {
  lines: ActivityLine[];
  from: string;
  to: string;
  showMoney: boolean;
  filterSummary?: string;
  timeZone?: string;
}): ActivityModel {
  const byClient = new Map<string, ActivityLine[]>();
  for (const line of input.lines) {
    const name = line.clientName.trim() || reportCopy.noClient;
    const list = byClient.get(name);
    if (list) list.push(line);
    else byClient.set(name, [{ ...line, clientName: name }]);
  }
  const names = [...byClient.keys()].sort((a, b) => a.localeCompare(b, "en"));
  const clients = names.map((name) => buildClient(name, byClient.get(name) ?? [], input));
  const grandLines = input.lines;
  return {
    title: reportCopy.activityReportTitle,
    dateRange: formatActivityRange(input.from, input.to),
    filterSummary: input.filterSummary ?? "",
    timeZone: input.timeZone ?? "",
    organization: reportCopy.organizationName,
    showMoney: input.showMoney,
    grand: totalsFor(grandLines, input.showMoney),
    clients,
  };
}

/**
 * Pack client sections onto pages. A group row stays with its first detail row.
 * A table that continues repeats the column header. A date group that splits
 * repeats the date and member row with "(continued)". The first time that
 * group is drawn, including when the whole group moves to the next page, is
 * not marked continued. A row taller than the page is placed anyway so the
 * loop cannot spin.
 */
export function paginateActivity(input: {
  sections: SectionMeasure[];
  firstRoom: number;
  nextRoom: number;
}): ActivitySlice[][] {
  const pages: ActivitySlice[][] = [[]];
  let used = 0;
  let room = input.firstRoom;
  let columnsOnPage = false;
  let headingOnPage = false;
  let groupOnPage: string | null = null;

  const freshPage = () => {
    pages.push([]);
    used = 0;
    room = input.nextRoom;
    columnsOnPage = false;
    headingOnPage = false;
    groupOnPage = null;
  };

  const place = (slice: ActivitySlice) => {
    pages[pages.length - 1].push(slice);
    used += slice.height;
    if (slice.type === "columns") columnsOnPage = true;
    if (slice.type === "heading") headingOnPage = true;
    if (slice.type === "group") groupOnPage = slice.id;
  };

  const reserve = (height: () => number) => {
    let guard = 0;
    while (used > 0 && used + height() > room && guard < 4) {
      freshPage();
      guard += 1;
    }
  };

  const preface = (section: SectionMeasure) =>
    (headingOnPage ? 0 : section.heading) + (columnsOnPage ? 0 : section.columns);

  const continueSection = (section: SectionMeasure) => {
    if (!headingOnPage) {
      place({
        type: "heading",
        client: section.client,
        continued: true,
        height: section.heading,
      });
    }
    if (!columnsOnPage) place({ type: "columns", height: section.columns });
  };

  for (const section of input.sections) {
    const first = section.groups[0];
    const firstBundle = first ? first.height + (first.details[0]?.height ?? 0) : section.total;
    reserve(() => section.heading + section.columns + firstBundle);
    place({ type: "heading", client: section.client, continued: false, height: section.heading });
    place({ type: "columns", height: section.columns });
    for (const group of section.groups) {
      const bundle = group.height + (group.details[0]?.height ?? 0);
      reserve(() => preface(section) + bundle);
      continueSection(section);
      place({ type: "group", id: group.id, continued: false, height: group.height });
      group.details.forEach((detail, index) => {
        if (index === 0) {
          place({ type: "detail", id: detail.id, height: detail.height });
          return;
        }
        reserve(
          () => preface(section) + (groupOnPage === group.id ? 0 : group.height) + detail.height,
        );
        continueSection(section);
        if (groupOnPage !== group.id) {
          place({ type: "group", id: group.id, continued: true, height: group.height });
        }
        place({ type: "detail", id: detail.id, height: detail.height });
      });
    }
    reserve(() => preface(section) + section.total);
    continueSection(section);
    place({ type: "total", client: section.client, height: section.total });
  }

  return pages.filter((page, index) => page.length > 0 || index === 0);
}

export function renderTimeActivityPdf(input: {
  model: ActivityModel;
  appUrl: string;
  empty?: string | null;
  compress?: boolean;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      layout: "landscape",
      margin: MARGIN,
      bufferPages: true,
      compress: input.compress !== false,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      drawActivity(doc, input.model, input.empty ?? null);
      stampActivityFooter(doc, pdfText(input.appUrl));
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function buildClient(name: string, lines: ActivityLine[], input: { showMoney: boolean }): ActivityClient {
  const groups = new Map<string, ActivityLine[]>();
  for (const line of lines) {
    const key = `${line.date}\t${line.memberName}`;
    const list = groups.get(key);
    if (list) list.push(line);
    else groups.set(key, [line]);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    const [dateA, memberA] = a.split("\t");
    const [dateB, memberB] = b.split("\t");
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return memberA.localeCompare(memberB, "en");
  });
  return {
    name,
    ...totalsFor(lines, input.showMoney),
    groups: keys.map((key) => buildGroup(name, key, groups.get(key) ?? [], input)),
  };
}

function buildGroup(
  clientName: string,
  key: string,
  lines: ActivityLine[],
  input: { showMoney: boolean },
): ActivityGroup {
  const [date, memberName] = key.split("\t");
  const byTodo = new Map<string, ActivityLine[]>();
  for (const line of lines) {
    const todoKey = line.projectName.trim();
    const list = byTodo.get(todoKey);
    if (list) list.push(line);
    else byTodo.set(todoKey, [line]);
  }
  const todos = [...byTodo.keys()].sort((a, b) => a.localeCompare(b, "en"));
  return {
    // The client is part of the id. Date and member repeat across clients, and
    // the painter looks rows up by id.
    id: `${clientName}\t${key}`,
    dateLabel: formatActivityDate(date),
    memberName,
    ...totalsFor(lines, input.showMoney),
    details: todos.map((todo) =>
      buildDetail(`${clientName}\t${key}`, todo, byTodo.get(todo) ?? [], input),
    ),
  };
}

function buildDetail(
  groupId: string,
  todoKey: string,
  lines: ActivityLine[],
  input: { showMoney: boolean },
): ActivityDetail {
  const missingTodo = todoKey === "";
  return {
    id: `${groupId}\t${todoKey}`,
    todo: missingTodo ? reportCopy.noTodo : todoKey,
    missingTodo,
    notes: detailNotes(lines),
    ...totalsFor(lines, input.showMoney),
  };
}

function detailNotes(lines: ActivityLine[]) {
  const parts: string[] = [];
  if (lines.some((line) => line.manual)) parts.push(reportCopy.manuallyAdded);
  else if (lines.some((line) => line.edited)) parts.push(reportCopy.editedNote);
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.note === "" || seen.has(line.note)) continue;
    seen.add(line.note);
    parts.push(line.note);
  }
  return limitNotes(parts.join("; "));
}

function limitNotes(text: string) {
  const flat = text.replace(/[\r\n]+/g, " ");
  if (flat.length <= ACTIVITY_NOTES_MAX) return flat;
  return `${flat.slice(0, ACTIVITY_NOTES_MAX).trimEnd()}…`;
}

function totalsFor(lines: ActivityLine[], showMoney: boolean) {
  const amounts = sumMoney(lines.map((line) => line.amount));
  return {
    time: formatActivityDuration(lines.reduce((sum, line) => sum + line.durationMs, 0)),
    billed: showMoney ? billedAmount(lines, amounts) : "",
    billable: formatActivityDuration(lines.reduce((sum, line) => sum + line.billableMs, 0)),
  };
}

/**
 * Rated amounts use that rate's currency, including an explicit zero.
 * Unrated billable time is the em dash. Non-billable time adds nothing:
 * the amount cell on screen is blank, and billable time is already 0:00:00.
 */
function billedAmount(lines: ActivityLine[], amounts: MoneyTotal[]) {
  const parts = amounts.map(formatOneMoney);
  const unrated = lines.some((line) => line.amount === null && line.billableMs > 0);
  if (unrated) parts.push(activityNoAmount);
  return parts.join("\n");
}

function formatOneMoney(total: MoneyTotal) {
  const digits = minorDigits(total.currency) ?? 2;
  const negative = total.amountMinor < 0;
  const abs = Math.abs(total.amountMinor);
  const scale = 10 ** digits;
  const whole = digits === 0 ? abs : Math.trunc(abs / scale);
  const fraction = digits === 0 ? 0 : abs % scale;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = digits === 0 ? grouped : `${grouped}.${String(fraction).padStart(digits, "0")}`;
  const symbol = SYMBOLS[total.currency];
  const prefix = negative ? "-" : "";
  return symbol ? `${prefix}${symbol}${body}` : `${prefix}${total.currency} ${body}`;
}

type Doc = InstanceType<typeof PDFDocument>;

function contentWidth(doc: Doc) {
  return doc.page.width - MARGIN * 2;
}

function contentBottom(doc: Doc) {
  return doc.page.height - FOOTER_TOP;
}

function drawActivity(doc: Doc, model: ActivityModel, empty: string | null) {
  const chrome = headerChrome(doc, model);
  drawRunningHeader(doc, model, chrome);
  drawIntro(doc, model);
  if (model.clients.length === 0) {
    doc.font("Helvetica").fontSize(11).fillColor(INK).text(pdfText(empty ?? reportCopy.empty), {
      width: contentWidth(doc),
    });
    return;
  }
  const widths = columnWidths(model.showMoney, contentWidth(doc));
  const sections = model.clients.map((client) => measureSection(doc, client, widths, model.showMoney));
  const firstRoom = contentBottom(doc) - doc.y;
  const nextRoom = contentBottom(doc) - chrome.contentY;
  const pages = paginateActivity({ sections, firstRoom, nextRoom });
  pages.forEach((page, index) => {
    if (page.length === 0) return;
    if (index > 0) {
      doc.addPage();
      drawRunningHeader(doc, model, chrome);
    }
    for (const slice of page) drawSlice(doc, model, slice, widths);
  });
}

function headerTextWidth(doc: Doc) {
  return Math.min(460, contentWidth(doc) - 130);
}

/** Date on the right, then the filter summary and timezone, then the rule. */
function headerChrome(doc: Doc, model: ActivityModel) {
  const width = headerTextWidth(doc);
  doc.font("Helvetica").fontSize(8);
  let y = 36;
  if (model.filterSummary) {
    y += doc.heightOfString(pdfText(model.filterSummary) || " ", { width }) + 2;
  }
  if (model.timeZone) {
    y += doc.heightOfString(pdfText(`${reportCopy.timezoneLabel}: ${model.timeZone}`), { width }) + 2;
  }
  const ruleY = Math.max(y + 2, 48);
  return { width, ruleY, contentY: ruleY + 10 };
}

function drawRunningHeader(
  doc: Doc,
  model: ActivityModel,
  chrome: { width: number; ruleY: number; contentY: number },
) {
  const x = MARGIN + contentWidth(doc) - chrome.width;
  doc.image(ulixLogoPng, MARGIN, 20, { height: 22 });
  doc.font("Helvetica-Bold").fontSize(10).fillColor(INK);
  doc.text(pdfText(model.dateRange), x, 22, {
    width: chrome.width,
    align: "right",
    lineBreak: false,
    height: 14,
  });
  let y = 36;
  doc.font("Helvetica").fontSize(8).fillColor(MUTED);
  if (model.filterSummary) {
    doc.text(pdfText(model.filterSummary), x, y, { width: chrome.width, align: "right" });
    y = doc.y + 2;
  }
  if (model.timeZone) {
    doc.text(pdfText(`${reportCopy.timezoneLabel}: ${model.timeZone}`), x, y, {
      width: chrome.width,
      align: "right",
    });
  }
  doc.save();
  doc
    .moveTo(MARGIN, chrome.ruleY)
    .lineTo(MARGIN + contentWidth(doc), chrome.ruleY)
    .strokeColor(RULE)
    .lineWidth(0.7)
    .stroke();
  doc.restore();
  doc.x = MARGIN;
  doc.y = chrome.contentY;
}

function drawIntro(doc: Doc, model: ActivityModel) {
  const width = contentWidth(doc);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(16).text(pdfText(model.title), MARGIN, doc.y, {
    width,
    align: "center",
  });
  doc.moveDown(0.35);
  doc.font("Helvetica-Bold").fontSize(12).text(pdfText(model.organization), { width, align: "left" });
  doc.moveDown(0.25);
  doc.font("Helvetica-Bold").fontSize(11).text(pdfText(reportCopy.grandTotal), { width });
  doc.moveDown(0.2);
  drawGrandTotal(doc, model);
  doc.moveDown(0.6);
}

function drawGrandTotal(doc: Doc, model: ActivityModel) {
  const labels = model.showMoney
    ? [reportCopy.timeLabel, reportCopy.billedAmount, reportCopy.billableTime]
    : [reportCopy.timeLabel, reportCopy.billableTime];
  const values = model.showMoney
    ? [model.grand.time, model.grand.billed, model.grand.billable]
    : [model.grand.time, model.grand.billable];
  const tableWidth = contentWidth(doc);
  const col = tableWidth / labels.length;
  const y = doc.y;
  const rowH = 18;
  doc.save();
  doc.rect(MARGIN, y, tableWidth, rowH).fill(HEADER_BG);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(INK);
  labels.forEach((label, index) => {
    doc.text(pdfText(label), MARGIN + index * col + 4, y + 5, {
      width: col - 8,
      lineBreak: false,
    });
  });
  doc.font("Helvetica").fontSize(9);
  const valueH = Math.max(
    18,
    ...values.map(
      (value) => doc.heightOfString(pdfText(value) || " ", { width: col - 8 }) + 8,
    ),
  );
  values.forEach((value, index) => {
    doc.text(pdfText(value), MARGIN + index * col + 4, y + rowH + 4, {
      width: col - 8,
    });
  });
  doc.y = y + rowH + valueH + 2;
}

function columnWidths(showMoney: boolean, total: number) {
  const fixed = showMoney
    ? [108, 100, 58, 140, 68, 78, 78]
    : [108, 108, 58, 160, 72, 78];
  const used = fixed.reduce((sum, width) => sum + width, 0);
  return [...fixed, Math.max(total - used, 72)];
}

function columnLabels(showMoney: boolean) {
  const labels: string[] = [
    reportCopy.date,
    reportCopy.member,
    reportCopy.todoId,
    reportCopy.todos,
    reportCopy.timeLabel,
  ];
  if (showMoney) labels.push(reportCopy.billedAmountColumn);
  labels.push(reportCopy.billableTimeColumn, reportCopy.notes);
  return labels;
}

function measureSection(doc: Doc, client: ActivityClient, widths: number[], showMoney: boolean): SectionMeasure {
  return {
    client: client.name,
    heading: Math.max(
      16,
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .heightOfString(pdfText(`${client.name} (continued)`) || " ", {
          width: contentWidth(doc),
        }) + 6,
    ),
    columns: 18,
    total: measureCells(doc, totalCells(client, showMoney), widths, true),
    groups: client.groups.map((group) => {
      const cells = groupCells(group, showMoney);
      const continued = [...cells];
      continued[0] = `${group.dateLabel} (continued)`;
      return {
        id: group.id,
        height: Math.max(
          measureCells(doc, cells, widths, true),
          measureCells(doc, continued, widths, true),
        ),
        details: group.details.map((detail) => ({
          id: detail.id,
          height: measureCells(doc, detailCells(detail, showMoney), widths, false, detail.missingTodo),
        })),
      };
    }),
  };
}

function groupCells(group: ActivityGroup, showMoney: boolean) {
  const cells = [group.dateLabel, group.memberName, "", "", group.time];
  if (showMoney) cells.push(group.billed);
  cells.push(group.billable, "");
  return cells;
}

function detailCells(detail: ActivityDetail, showMoney: boolean) {
  const cells = ["", "", "", detail.todo, detail.time];
  if (showMoney) cells.push(detail.billed);
  cells.push(detail.billable, detail.notes);
  return cells;
}

function totalCells(client: ActivityClient, showMoney: boolean) {
  const cells = [reportCopy.total, "", "", "", client.time];
  if (showMoney) cells.push(client.billed);
  cells.push(client.billable, "");
  return cells;
}

function measureCells(doc: Doc, cells: string[], widths: number[], bold: boolean, italicTodo = false) {
  let height = 16;
  cells.forEach((cell, index) => {
    const font = italicTodo && index === 3 ? "Helvetica-Oblique" : bold ? "Helvetica-Bold" : "Helvetica";
    doc.font(font).fontSize(8);
    const textHeight = doc.heightOfString(pdfText(cell) || " ", {
      width: Math.max((widths[index] ?? 40) - 8, 8),
    });
    height = Math.max(height, textHeight + 8);
  });
  return height;
}

function drawSlice(doc: Doc, model: ActivityModel, slice: ActivitySlice, widths: number[]) {
  const y = doc.y;
  if (slice.type === "heading") {
    const label = slice.continued ? `${slice.client} (continued)` : slice.client;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(INK);
    doc.text(pdfText(label), MARGIN, y + 3, {
      width: contentWidth(doc),
      height: Math.max(slice.height - 4, 8),
    });
    doc.y = y + slice.height;
    return;
  }
  if (slice.type === "columns") {
    drawColumnHeader(doc, columnLabels(model.showMoney), widths, y);
    doc.y = y + slice.height;
    return;
  }
  const client = model.clients.find((item) => item.name === sliceClient(slice, model));
  if (!client) {
    doc.y = y + slice.height;
    return;
  }
  if (slice.type === "group") {
    const group = client.groups.find((item) => item.id === slice.id);
    if (group) {
      const cells = groupCells(group, model.showMoney);
      if (slice.continued) cells[0] = `${group.dateLabel} (continued)`;
      drawDataRow(doc, cells, widths, y, slice.height, true, true, false);
    }
    doc.y = y + slice.height;
    return;
  }
  if (slice.type === "detail") {
    const detail = findDetail(client, slice.id);
    if (detail) {
      drawDataRow(
        doc,
        detailCells(detail, model.showMoney),
        widths,
        y,
        slice.height,
        false,
        true,
        detail.missingTodo,
      );
    }
    doc.y = y + slice.height;
    return;
  }
  drawDataRow(doc, totalCells(client, model.showMoney), widths, y, slice.height, true, false, false);
  doc.y = y + slice.height;
}

function sliceClient(slice: ActivitySlice, model: ActivityModel) {
  if (slice.type === "heading" || slice.type === "total") return slice.client;
  if (slice.type === "columns") return "";
  return model.clients.find((client) =>
    client.groups.some((group) => group.id === slice.id || group.details.some((detail) => detail.id === slice.id)),
  )?.name ?? "";
}

function findDetail(client: ActivityClient, id: string) {
  for (const group of client.groups) {
    const detail = group.details.find((item) => item.id === id);
    if (detail) return detail;
  }
  return null;
}

function drawColumnHeader(doc: Doc, labels: string[], widths: number[], y: number) {
  doc.save();
  doc.rect(MARGIN, y, contentWidth(doc), 18).fill(HEADER_BG);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(INK);
  let x = MARGIN;
  labels.forEach((label, index) => {
    doc.text(pdfText(label), x + 4, y + 5, {
      width: Math.max((widths[index] ?? 40) - 8, 8),
      lineBreak: false,
      height: 12,
    });
    x += widths[index] ?? 0;
  });
}

function drawDataRow(
  doc: Doc,
  cells: string[],
  widths: number[],
  y: number,
  height: number,
  bold: boolean,
  shade: boolean,
  italicTodo: boolean,
) {
  if (shade) {
    doc.save();
    doc.rect(MARGIN, y, contentWidth(doc), height).fill(GREY);
    doc.restore();
  }
  doc.save();
  doc
    .moveTo(MARGIN, y + height)
    .lineTo(MARGIN + contentWidth(doc), y + height)
    .strokeColor(LINE)
    .lineWidth(0.4)
    .stroke();
  doc.restore();
  let x = MARGIN;
  cells.forEach((cell, index) => {
    const font = italicTodo && index === 3 ? "Helvetica-Oblique" : bold ? "Helvetica-Bold" : "Helvetica";
    doc.font(font).fontSize(8).fillColor(INK);
    doc.text(pdfText(cell), x + 4, y + 4, {
      width: Math.max((widths[index] ?? 40) - 8, 8),
      height: Math.max(height - 6, 8),
    });
    x += widths[index] ?? 0;
  });
}

function stampActivityFooter(doc: Doc, appUrl: string) {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    // The footer sits in the bottom margin. Leaving the margin in place makes
    // pdfkit push the page number and URL onto extra pages.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 24;
    const width = contentWidth(doc);
    doc.font("Helvetica").fontSize(8).fillColor(MUTED);
    const label = pdfText(reportCopy.generatedWith);
    doc.text(label, MARGIN, y, { lineBreak: false, height: 12 });
    const labelWidth = doc.widthOfString(label);
    doc.image(ulixLogoPng, MARGIN + labelWidth + 6, y - 3, { height: 12 });
    doc.text(`Page ${index + 1} of ${range.count}`, MARGIN, y, {
      width,
      align: "center",
      lineBreak: false,
      height: 12,
    });
    doc.text(appUrl, MARGIN, y, { width, align: "right", lineBreak: false, height: 12 });
  }
}
