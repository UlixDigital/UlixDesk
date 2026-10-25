import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { compareActivityGroups, type ActivityNode } from "@/lib/activity-grouping";
import { minorDigits } from "@/lib/currencies";
import type { MoneyTotal } from "@/lib/money";
import { sumMoney } from "@/lib/money";
import { reportCopy } from "@/lib/report-copy";
import { defaultActivitySort, type ActivitySort, type GroupBy } from "@/lib/report-query";
import { pdfText } from "@/lib/report-pdf";
import { formatCivilDate } from "@/lib/time-zone";
import { formatDayHeading } from "@/lib/timesheet";
import { ulixLogoPng } from "@/lib/ulix-logo";

const INK = "#333333";
const BLACK = "#000000";
const HEADER_RULE = "#d1d5db";
const LINE = "#e5e7eb";
const STRIPE = "#f3f4f6";
const LINK = "#0000ee";

const LEFT = 35;
const RIGHT = 33;
const CONTENT_TOP = 85;
const CONTENT_BOTTOM = 562;
const HEADER_RULE_Y = 30;
const TITLE_Y = 42;
const FOOTER_RULE_Y = 568;
const FOOTER_TEXT_Y = 570;

const BODY = 5.4;
const TITLE = 12;
const ORG = 7;
const RANGE = 6.6;
const FOOTER = 7.4;
const ROW = 21;
const HEADING = 12;
const PAD = 6.5;

const FONT = "DejaVu";
const FONT_BOLD = "DejaVu-Bold";

const SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  NZD: "NZ$",
};

export const ACTIVITY_REPORT_HOST = "desk.ulixdigital.com";

export type ActivityPdfRun = {
  text: string;
  x: number;
  y: number;
  font: "regular" | "bold";
  size: number;
  color: string;
};

type Weight = "regular" | "bold";

export type ActivityLine = {
  clientName: string;
  date: string;
  memberName: string;
  projectName: string;
  clientId?: string;
  projectId?: string;
  memberId?: string;
  /** Set when the entry has a real to-do. Otherwise the column stays the project name. */
  todoId?: string;
  todoTitle?: string;
  durationMs: number;
  billableMs: number;
  amount: MoneyTotal | null;
  note: string;
  manual: boolean;
  edited: boolean;
};

export type ActivitySource = {
  userId: string;
  userName: string;
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  todoId: string;
  todoTitle: string;
  date: string;
  durationMs: number;
  billableMs: number;
  amount: MoneyTotal | null;
  note: string;
  source: "manual" | "timer";
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
  date: string;
  dateLabel: string;
  /** False when an earlier member row in this section already showed this date. */
  showDate: boolean;
  /** Gray band. The first date+member group in a section is white. */
  shade: boolean;
  memberName: string;
  time: string;
  billed: string;
  billable: string;
  details: ActivityDetail[];
};

export type ActivitySection = {
  id: string;
  name: string;
  time: string;
  billed: string;
  billable: string;
  groups: ActivityGroup[];
};

export type ActivityModel = {
  title: string;
  dateRange: string;
  /** Kept for callers. The reference PDF does not print filters or the timezone. */
  filterSummary: string;
  timeZone: string;
  organization: string;
  showMoney: boolean;
  grand: { time: string; billed: string; billable: string };
  sections: ActivitySection[];
};

export type ActivitySlice =
  | { type: "heading"; sectionId: string; height: number }
  | { type: "columns"; height: number }
  | { type: "group"; id: string; height: number }
  | { type: "detail"; id: string; height: number }
  | { type: "total"; sectionId: string; height: number };

type SectionMeasure = {
  sectionId: string;
  heading: number;
  columns: number;
  groups: Array<{ id: string; height: number; details: Array<{ id: string; height: number }> }>;
  total: number;
};

type Doc = InstanceType<typeof PDFDocument>;

/** Hostname only. An empty origin falls back to the public UlixDesk host. */
export function activityFooterHost(origin?: string | null) {
  const raw = (origin ?? process.env.ULIXDESK_PUBLIC_ORIGIN ?? "").trim();
  if (!raw) return ACTIVITY_REPORT_HOST;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withScheme).hostname;
    return host || ACTIVITY_REPORT_HOST;
  } catch {
    return ACTIVITY_REPORT_HOST;
  }
}

export function activityLineFromSlice(slice: ActivitySource): ActivityLine {
  return {
    clientId: slice.clientId,
    clientName: slice.clientName,
    projectId: slice.projectId,
    projectName: slice.projectName,
    memberId: slice.userId,
    memberName: slice.userName,
    date: slice.date,
    todoId: slice.todoId || undefined,
    todoTitle: slice.todoTitle || undefined,
    durationMs: slice.durationMs,
    billableMs: slice.billableMs,
    amount: slice.amount,
    note: slice.note,
    manual: slice.source === "manual",
    edited: slice.edited,
  };
}

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
  organization?: string;
  groupBy?: GroupBy;
  sort?: ActivitySort;
}): ActivityModel {
  const groupBy = input.groupBy ?? "project";
  const sort = input.sort ?? defaultActivitySort(groupBy);
  const buckets = new Map<string, { label: string; lines: ActivityLine[] }>();
  for (const line of input.lines) {
    const key = sectionKey(line, groupBy);
    const bucket = buckets.get(key.id);
    if (bucket) bucket.lines.push(line);
    else buckets.set(key.id, { label: key.label, lines: [line] });
  }
  const ordered = [...buckets.entries()].sort((a, b) =>
    compareActivityGroups(sectionNode(a[0], a[1].label, a[1].lines), sectionNode(b[0], b[1].label, b[1].lines), sort),
  );
  return {
    title: reportCopy.activityReportTitle,
    dateRange: formatActivityRange(input.from, input.to),
    filterSummary: input.filterSummary ?? "",
    timeZone: input.timeZone ?? "",
    organization: input.organization?.trim() || reportCopy.organizationName,
    showMoney: input.showMoney,
    grand: totalsFor(input.lines, input.showMoney),
    sections: ordered.map(([id, bucket]) => buildSection(id, bucket.label, bucket.lines, input.showMoney)),
  };
}

/**
 * Pack sections in reading order. A page break does not repeat the project
 * name, the column header, or a "(continued)" row. A slice taller than an
 * empty page is placed anyway so the loop cannot spin.
 */
export function paginateActivity(input: {
  sections: SectionMeasure[];
  firstRoom: number;
  nextRoom: number;
}): ActivitySlice[][] {
  const pages: ActivitySlice[][] = [[]];
  let used = 0;
  let room = input.firstRoom;

  const freshPage = () => {
    pages.push([]);
    used = 0;
    room = input.nextRoom;
  };

  const place = (slice: ActivitySlice) => {
    if (used > 0 && used + slice.height > room) freshPage();
    pages[pages.length - 1].push(slice);
    used += slice.height;
  };

  for (const section of input.sections) {
    place({ type: "heading", sectionId: section.sectionId, height: section.heading });
    place({ type: "columns", height: section.columns });
    for (const group of section.groups) {
      place({ type: "group", id: group.id, height: group.height });
      for (const detail of group.details) {
        place({ type: "detail", id: detail.id, height: detail.height });
      }
    }
    place({ type: "total", sectionId: section.sectionId, height: section.total });
  }

  return pages.filter((page, index) => page.length > 0 || index === 0);
}

export function renderTimeActivityPdf(input: {
  model: ActivityModel;
  appUrl?: string;
  empty?: string | null;
  compress?: boolean;
  trace?: ActivityPdfRun[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      layout: "landscape",
      margin: 0,
      bufferPages: true,
      compress: input.compress !== false,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      doc.registerFont(FONT, fontFile("DejaVuSans.ttf"));
      doc.registerFont(FONT_BOLD, fontFile("DejaVuSans-Bold.ttf"));
      drawActivity(doc, input.model, input.empty ?? null, input.trace);
      stampActivityFooter(doc, activityFooterHost(input.appUrl), input.trace);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function sectionKey(line: ActivityLine, groupBy: GroupBy) {
  if (groupBy === "member") {
    const label = line.memberName.trim() || reportCopy.unassigned;
    return { id: line.memberId?.trim() || label, label };
  }
  if (groupBy === "client") {
    const label = line.clientName.trim() || reportCopy.noClient;
    return { id: line.clientId?.trim() || label, label };
  }
  if (groupBy === "todo") {
    const id = line.todoId?.trim() ?? "";
    if (!id) return { id: "none", label: reportCopy.noTodo };
    return { id, label: (line.todoTitle ?? "").trim() || reportCopy.noTodo };
  }
  if (groupBy === "date") return { id: line.date, label: formatDayHeading(line.date) };
  const label = line.projectName.trim() || reportCopy.unassigned;
  return { id: line.projectId?.trim() || label, label };
}

function sectionNode(id: string, label: string, lines: ActivityLine[]): ActivityNode {
  let minDate = "";
  let maxDate = "";
  let durationMs = 0;
  let billableMs = 0;
  for (const line of lines) {
    durationMs += line.durationMs;
    billableMs += line.billableMs;
    if (!minDate || line.date < minDate) minDate = line.date;
    if (!maxDate || line.date > maxDate) maxDate = line.date;
  }
  return {
    id,
    label,
    minDate,
    maxDate,
    durationMs,
    billableMs,
    amounts: sumMoney(lines.map((line) => line.amount)),
    unrated: lines.some((line) => line.amount === null && line.billableMs > 0),
    children: [],
  };
}

function buildSection(id: string, label: string, lines: ActivityLine[], showMoney: boolean): ActivitySection {
  const grouped = new Map<string, ActivityLine[]>();
  for (const line of lines) {
    const memberKey = line.memberId?.trim() || line.memberName;
    const key = `${line.date}\t${memberKey}`;
    const list = grouped.get(key);
    if (list) list.push(line);
    else grouped.set(key, [line]);
  }
  const keys = [...grouped.keys()].sort((a, b) => {
    const dateA = a.split("\t")[0] ?? "";
    const dateB = b.split("\t")[0] ?? "";
    if (dateA !== dateB) return dateA < dateB ? -1 : 1;
    const nameA = grouped.get(a)?.[0]?.memberName ?? "";
    const nameB = grouped.get(b)?.[0]?.memberName ?? "";
    return nameA.localeCompare(nameB, "en", { sensitivity: "base" });
  });
  const groups = keys.map((key) => buildGroup(id, key, grouped.get(key) ?? [], showMoney));
  groups.forEach((group, index) => {
    group.showDate = index === 0 || group.date !== groups[index - 1]?.date;
    group.shade = index % 2 === 1;
  });
  return {
    id,
    name: label,
    ...totalsFor(lines, showMoney),
    groups,
  };
}

function buildGroup(sectionId: string, key: string, lines: ActivityLine[], showMoney: boolean): ActivityGroup {
  const date = key.split("\t")[0] ?? "";
  const memberName = lines[0]?.memberName ?? "";
  const byTodo = new Map<string, { label: string; lines: ActivityLine[] }>();
  for (const line of lines) {
    const title = (line.todoTitle ?? "").trim();
    const project = line.projectName.trim();
    const label = title || project;
    const todoKey = (line.todoId ?? "").trim() || label || reportCopy.noTodo;
    const existing = byTodo.get(todoKey);
    if (existing) {
      existing.lines.push(line);
      if (!existing.label && label) existing.label = label;
    } else byTodo.set(todoKey, { label, lines: [line] });
  }
  const todos = [...byTodo.entries()].sort(
    (a, b) => a[1].label.localeCompare(b[1].label, "en") || a[0].localeCompare(b[0]),
  );
  const groupId = `${sectionId}\t${key}`;
  return {
    id: groupId,
    date,
    dateLabel: formatActivityDate(date),
    showDate: true,
    shade: false,
    memberName,
    ...totalsFor(lines, showMoney),
    details: todos.map(([todoKey, bucket]) =>
      buildDetail(groupId, todoKey, bucket.label, bucket.lines, showMoney),
    ),
  };
}

function buildDetail(
  groupId: string,
  todoKey: string,
  label: string,
  lines: ActivityLine[],
  showMoney: boolean,
): ActivityDetail {
  const missingTodo = label === "";
  return {
    id: `${groupId}\t${todoKey}`,
    todo: missingTodo ? reportCopy.noTodo : label,
    missingTodo,
    notes: detailNotes(lines),
    ...totalsFor(lines, showMoney),
  };
}

function detailNotes(lines: ActivityLine[]) {
  const parts: string[] = [];
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

function fontFile(name: string) {
  const candidates = [
    path.join(process.cwd(), "assets/fonts", name),
    path.join(process.cwd(), "..", "assets/fonts", name),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Missing report font ${name}.`);
  return found;
}

function contentWidth(doc: Doc) {
  return doc.page.width - LEFT - RIGHT;
}

function columnWidths(showMoney: boolean, total: number) {
  // The old To-do ID column was 133pt. Split it between To-dos (66) and Notes (67).
  // Without money, To-dos still absorbs the 66pt billed column as well.
  const todos = showMoney ? 198 : 264;
  const fixed = showMoney ? [66, 66, todos, 66, 66, 66] : [66, 66, todos, 66, 66];
  const used = fixed.reduce((sum, width) => sum + width, 0);
  return [...fixed, Math.max(total - used, 40)];
}

function columnLabels(showMoney: boolean) {
  const labels: string[] = [
    reportCopy.date,
    reportCopy.member,
    reportCopy.todos,
    reportCopy.timeLabel,
  ];
  if (showMoney) labels.push(reportCopy.billedAmountColumn);
  labels.push(reportCopy.billableTimeColumn, reportCopy.notes);
  return labels;
}

function drawActivity(doc: Doc, model: ActivityModel, empty: string | null, trace?: ActivityPdfRun[]) {
  doc.font(FONT).fontSize(BODY);
  const single = doc.heightOfString("Ag", { width: 200 });
  const topPad = Math.max((ROW - single) / 2, 1);
  const widths = columnWidths(model.showMoney, contentWidth(doc));
  drawRunningHeader(doc, model, trace);
  const introBottom = drawIntro(doc, model, trace);
  if (model.sections.length === 0) {
    paint(doc, empty ?? reportCopy.empty, LEFT, introBottom + 8, {
      width: contentWidth(doc),
      font: "regular",
      size: BODY,
      color: INK,
    }, trace);
    return;
  }
  const sections = model.sections.map((section) => measureSection(doc, section, widths, model.showMoney, single));
  const pages = paginateActivity({
    sections,
    firstRoom: CONTENT_BOTTOM - introBottom,
    nextRoom: CONTENT_BOTTOM - CONTENT_TOP,
  });
  pages.forEach((page, index) => {
    if (page.length === 0) return;
    let y = index === 0 ? introBottom : CONTENT_TOP;
    if (index > 0) {
      doc.addPage();
      drawRunningHeader(doc, model, trace);
    }
    for (const slice of page) {
      drawSlice(doc, model, slice, widths, y, topPad, trace);
      y += slice.height;
    }
  });
}

function drawRunningHeader(doc: Doc, model: ActivityModel, trace?: ActivityPdfRun[]) {
  doc.image(ulixLogoPng, LEFT, 6, { height: 20 });
  paint(doc, model.dateRange, LEFT, 15, {
    width: contentWidth(doc),
    align: "right",
    font: "regular",
    size: RANGE,
    color: BLACK,
    lineBreak: false,
  }, trace);
  stroke(doc, LEFT, HEADER_RULE_Y, LEFT + contentWidth(doc), HEADER_RULE_Y, HEADER_RULE, 0.6);
  paint(doc, model.title, 0, TITLE_Y, {
    width: doc.page.width,
    align: "center",
    font: "bold",
    size: TITLE,
    color: BLACK,
    lineBreak: false,
  }, trace);
  doc.x = LEFT;
  doc.y = CONTENT_TOP;
}

function drawIntro(doc: Doc, model: ActivityModel, trace?: ActivityPdfRun[]) {
  paint(doc, model.organization, LEFT, CONTENT_TOP, {
    width: contentWidth(doc),
    font: "bold",
    size: ORG,
    color: INK,
    lineBreak: false,
  }, trace);
  paint(doc, reportCopy.grandTotal, LEFT, 107, {
    width: contentWidth(doc),
    font: "bold",
    size: BODY,
    color: INK,
    lineBreak: false,
  }, trace);
  const labels = model.showMoney
    ? [reportCopy.timeLabel, reportCopy.billedAmount, reportCopy.billableTime]
    : [reportCopy.timeLabel, reportCopy.billableTime];
  const values = model.showMoney
    ? [model.grand.time, model.grand.billed, model.grand.billable]
    : [model.grand.time, model.grand.billable];
  const col = contentWidth(doc) / labels.length;
  labels.forEach((label, index) => {
    paint(doc, label, LEFT + index * col + PAD, 125, {
      width: col - PAD * 2,
      font: "bold",
      size: BODY,
      color: INK,
      lineBreak: false,
    }, trace);
  });
  stroke(doc, LEFT, 139, LEFT + contentWidth(doc), 139, LINE, 0.5);
  let valueHeight = singleLine(doc);
  values.forEach((value) => {
    doc.font(FONT_BOLD).fontSize(BODY);
    valueHeight = Math.max(valueHeight, doc.heightOfString(pdfText(value) || " ", { width: col - PAD * 2 }));
  });
  values.forEach((value, index) => {
    paint(doc, value, LEFT + index * col + PAD, 146, {
      width: col - PAD * 2,
      font: "bold",
      size: BODY,
      color: INK,
    }, trace);
  });
  return 146 + valueHeight + 8;
}

function measureSection(
  doc: Doc,
  section: ActivitySection,
  widths: number[],
  showMoney: boolean,
  single: number,
): SectionMeasure {
  doc.font(FONT_BOLD).fontSize(BODY);
  const headingText = doc.heightOfString(pdfText(section.name) || " ", { width: contentWidth(doc) });
  return {
    sectionId: section.id,
    heading: Math.max(HEADING, headingText + 4),
    columns: ROW,
    total: rowHeight(cellHeights(doc, totalCells(section, showMoney), totalFonts(showMoney), widths), single),
    groups: section.groups.map((group) => ({
      id: group.id,
      height: rowHeight(
        cellHeights(doc, groupCells(group, showMoney), summaryFonts(showMoney), widths),
        single,
      ),
      details: group.details.map((detail) => ({
        id: detail.id,
        height: rowHeight(
          cellHeights(doc, detailCells(detail, showMoney), detailFonts(showMoney), widths),
          single,
        ),
      })),
    })),
  };
}

function singleLine(doc: Doc) {
  doc.font(FONT).fontSize(BODY);
  return doc.heightOfString("Ag", { width: 200 });
}

function rowHeight(heights: number[], single: number) {
  const text = Math.max(single, ...heights);
  return Math.max(ROW, text + Math.max(ROW - single, 0));
}

function cellHeights(doc: Doc, cells: string[], fonts: Weight[], widths: number[]) {
  return cells.map((cell, index) => {
    doc.font(fonts[index] === "bold" ? FONT_BOLD : FONT).fontSize(BODY);
    return doc.heightOfString(pdfText(cell) || " ", { width: Math.max((widths[index] ?? 40) - PAD * 2, 8) });
  });
}

function summaryFonts(showMoney: boolean): Weight[] {
  const fonts: Weight[] = ["regular", "regular", "regular", "bold"];
  if (showMoney) fonts.push("bold");
  fonts.push("bold", "regular");
  return fonts;
}

function detailFonts(showMoney: boolean): Weight[] {
  const fonts: Weight[] = ["regular", "regular", "regular", "regular"];
  if (showMoney) fonts.push("regular");
  fonts.push("regular", "regular");
  return fonts;
}

function totalFonts(showMoney: boolean): Weight[] {
  const fonts: Weight[] = ["bold", "regular", "regular", "bold"];
  if (showMoney) fonts.push("bold");
  fonts.push("bold", "regular");
  return fonts;
}

function groupCells(group: ActivityGroup, showMoney: boolean) {
  const cells = [group.showDate ? group.dateLabel : "", group.memberName, "", group.time];
  if (showMoney) cells.push(group.billed);
  cells.push(group.billable, "");
  return cells;
}

function detailCells(detail: ActivityDetail, showMoney: boolean) {
  const cells = ["", "", detail.todo, detail.time];
  if (showMoney) cells.push(detail.billed);
  cells.push(detail.billable, detail.notes);
  return cells;
}

function totalCells(section: ActivitySection, showMoney: boolean) {
  const cells = [reportCopy.total, "", "", section.time];
  if (showMoney) cells.push(section.billed);
  cells.push(section.billable, "");
  return cells;
}

function drawSlice(
  doc: Doc,
  model: ActivityModel,
  slice: ActivitySlice,
  widths: number[],
  y: number,
  topPad: number,
  trace?: ActivityPdfRun[],
) {
  if (slice.type === "heading") {
    const section = model.sections.find((item) => item.id === slice.sectionId);
    paint(doc, section?.name ?? "", LEFT, y + 1, {
      width: contentWidth(doc),
      height: Math.max(slice.height - 2, 4),
      font: "bold",
      size: BODY,
      color: INK,
    }, trace);
    return;
  }
  if (slice.type === "columns") {
    drawColumnHeader(doc, columnLabels(model.showMoney), widths, y, slice.height, topPad, trace);
    return;
  }
  if (slice.type === "group") {
    const found = findGroup(model, slice.id);
    if (!found) return;
    drawDataRow(
      doc,
      groupCells(found.group, model.showMoney),
      summaryFonts(model.showMoney),
      widths,
      y,
      slice.height,
      topPad,
      found.group.shade,
      found.group.details.length === 0,
      trace,
    );
    return;
  }
  if (slice.type === "detail") {
    const found = findDetail(model, slice.id);
    if (!found) return;
    const last = found.group.details[found.group.details.length - 1]?.id === found.detail.id;
    drawDataRow(
      doc,
      detailCells(found.detail, model.showMoney),
      detailFonts(model.showMoney),
      widths,
      y,
      slice.height,
      topPad,
      found.group.shade,
      last,
      trace,
    );
    return;
  }
  const section = model.sections.find((item) => item.id === slice.sectionId);
  if (!section) return;
  drawDataRow(
    doc,
    totalCells(section, model.showMoney),
    totalFonts(model.showMoney),
    widths,
    y,
    slice.height,
    topPad,
    false,
    false,
    trace,
  );
}

function findGroup(model: ActivityModel, id: string) {
  for (const section of model.sections) {
    const group = section.groups.find((item) => item.id === id);
    if (group) return { section, group };
  }
  return null;
}

function findDetail(model: ActivityModel, id: string) {
  for (const section of model.sections) {
    for (const group of section.groups) {
      const detail = group.details.find((item) => item.id === id);
      if (detail) return { section, group, detail };
    }
  }
  return null;
}

function drawColumnHeader(
  doc: Doc,
  labels: string[],
  widths: number[],
  y: number,
  height: number,
  topPad: number,
  trace?: ActivityPdfRun[],
) {
  const fonts = labels.map(() => "bold" as const);
  drawDataRow(doc, labels, fonts, widths, y, height, topPad, false, true, trace);
}

function drawDataRow(
  doc: Doc,
  cells: string[],
  fonts: Weight[],
  widths: number[],
  y: number,
  height: number,
  topPad: number,
  shade: boolean,
  rule: boolean,
  trace?: ActivityPdfRun[],
) {
  if (shade) {
    doc.save();
    doc.rect(LEFT, y + 0.4, contentWidth(doc), Math.max(height - 0.8, 1)).fill(STRIPE);
    doc.restore();
  }
  let x = LEFT;
  cells.forEach((cell, index) => {
    const width = widths[index] ?? 0;
    const inner = Math.max(width - PAD * 2, 4);
    if (cell) {
      paint(doc, cell, x + PAD, y + topPad, {
        width: inner,
        font: fonts[index] ?? "regular",
        size: BODY,
        color: INK,
      }, trace);
    }
    x += width;
  });
  if (rule) stroke(doc, LEFT, y + height - 0.4, LEFT + contentWidth(doc), y + height - 0.4, LINE, 0.4);
}

function stampActivityFooter(doc: Doc, host: string, trace?: ActivityPdfRun[]) {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    doc.page.margins.bottom = 0;
    stroke(doc, LEFT, FOOTER_RULE_Y, LEFT + contentWidth(doc), FOOTER_RULE_Y, LINE, 0.5);
    paint(doc, reportCopy.generatedWith, LEFT, FOOTER_TEXT_Y, {
      width: contentWidth(doc) / 2,
      font: "regular",
      size: FOOTER,
      color: INK,
      lineBreak: false,
    }, trace);
    doc.font(FONT).fontSize(FOOTER);
    const hostWidth = doc.widthOfString(pdfText(host));
    const hostX = LEFT + contentWidth(doc) - hostWidth;
    paint(doc, host, hostX, FOOTER_TEXT_Y, {
      width: hostWidth + 2,
      font: "regular",
      size: FOOTER,
      color: LINK,
      lineBreak: false,
    }, trace);
    stroke(doc, hostX, FOOTER_TEXT_Y + FOOTER, hostX + hostWidth, FOOTER_TEXT_Y + FOOTER, LINK, 0.4);
  }
}

function paint(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  options: {
    width: number;
    height?: number;
    align?: "left" | "right" | "center";
    font: Weight;
    size: number;
    color: string;
    lineBreak?: boolean;
  },
  trace?: ActivityPdfRun[],
) {
  const value = pdfText(text);
  if (!value) return;
  doc.font(options.font === "bold" ? FONT_BOLD : FONT).fontSize(options.size).fillColor(options.color);
  doc.text(value, x, y, {
    width: options.width,
    height: options.height,
    align: options.align,
    lineBreak: options.lineBreak !== false,
  });
  trace?.push({ text: value, x, y, font: options.font, size: options.size, color: options.color });
  doc.x = LEFT;
  doc.y = Math.min(y, CONTENT_TOP);
}

function stroke(doc: Doc, x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
  doc.save();
  doc.moveTo(x1, y1).lineTo(x2, y2).strokeColor(color).lineWidth(width).stroke();
  doc.restore();
}
