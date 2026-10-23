import type { ActivityLine } from "@/lib/time-activity-pdf";

/**
 * Rows from the Oct 12–18, 2026 reference report. Durations sum to 27:32:37.
 * Line amounts sum to $688.61. The printed Hubstaff grand total is $688.59
 * because four section totals were rounded by one cent.
 */
const ROWS: Array<[string, string, string, string, string, string, number, boolean?]> = [
  ["Accessories Unlimited", "2026-10-12", "Induwara Piyumal", "19218383", "Wp maintenance", "0:10:22", 432],
  ["Accessories Unlimited", "2026-10-13", "Induwara Piyumal", "19646649", "layout issues - ULXS-1254", "0:19:23", 808],
  ["Astro Glass", "2026-10-12", "Induwara Piyumal", "19225777", "Wp maintenance", "0:06:59", 291],
  ["Astro Glass", "2026-10-12", "Ulix Deves Developers", "18101845", "Publishing blogs", "0:56:34", 2357],
  ["Bergger Briggs", "2026-10-12", "Induwara Piyumal", "19225453", "Wp maintenance", "0:08:33", 356],
  ["Camino BHS", "2026-10-12", "Induwara Piyumal", "19216562", "wp maintenance", "0:10:23", 433],
  ["Camino BHS", "2026-10-13", "Induwara Piyumal", "19645734", "layout issues - ULXS-1254", "0:25:06", 1046],
  ["CICP", "2026-10-12", "Induwara Piyumal", "19225805", "Wp maintenance", "0:10:02", 418],
  ["CICP", "2026-10-13", "Induwara Piyumal", "19225805", "Wp maintenance", "0:17:57", 748],
  ["Covenant Schools", "2026-10-12", "Induwara Piyumal", "19223854", "Wp maintenance", "0:13:25", 559],
  ["Dakkaya", "2026-10-12", "Induwara Piyumal", "19217090", "Wp maintenence", "0:11:21", 473],
  ["Dakkaya", "2026-10-13", "Induwara Piyumal", "19646021", "layout issues - ULXS-1254", "0:09:21", 390],
  ["Document Solutions", "2026-10-12", "Induwara Piyumal", "19217175", "Wp maintenance", "0:16:25", 684],
  ["Document Solutions", "2026-10-13", "Yashmi Hewa Pinnapola", "19645708", "Fwd: Add our President to leadership page - 1253", "0:13:16", 553],
  ["Document Solutions", "2026-10-15", "Induwara Piyumal", "19681125", "Migrate DSI Live Site to WP Engine Staging Environment - ULXS-1255", "1:34:11", 3924],
  ["Hong Kong Buffet", "2026-10-12", "Induwara Piyumal", "19217490", "wp maintenance", "0:07:33", 315],
  ["Houser Raspberry Ranch", "2026-10-12", "Induwara Piyumal", "19226067", "Wp maintenance", "0:06:10", 257],
  ["MACC", "2026-10-12", "Induwara Piyumal", "19225247", "Wp maintenance", "0:05:41", 237],
  ["Marrs Legal", "2026-10-12", "Induwara Piyumal", "19224136", "Wp maintenance", "0:07:41", 320],
  ["Marrs Legal", "2026-10-13", "Induwara Piyumal", "19646113", "layout issues - ULXS-1254", "0:27:27", 1144],
  ["MP Group", "2026-10-12", "Induwara Piyumal", "19225685", "Wp maintenance", "0:05:58", 249],
  ["MP Group", "2026-10-13", "Induwara Piyumal", "19646740", "layout issues - ULXS-1254", "0:02:05", 87],
  ["Palms Trading", "2026-10-12", "Ulix Deves Developers", "16972824", "Workaround without Geo Blocking", "0:42:54", 1788],
  ["Palms Trading", "2026-10-12", "Yashmi Hewa Pinnapola", "18187563", "Fwd: Site Error - 968", "2:15:38", 5651],
  ["Palms Trading", "2026-10-13", "wijaya premarathna", "18759849", "website fix", "0:42:22", 1765],
  ["Palms Trading", "2026-10-15", "wijaya premarathna", "18759849", "website fix", "0:30:10", 1257],
  ["Palms Trading", "2026-10-16", "Yashmi Hewa Pinnapola", "18187563", "Fwd: Site Error - 968", "5:38:43", 14113],
  ["Palms Trading", "2026-10-17", "Yashmi Hewa Pinnapola", "18187563", "Fwd: Site Error - 968", "0:39:55", 1663],
  ["Pascetti Steel", "2026-10-12", "Induwara Piyumal", "19224391", "Wp maintenance", "0:08:59", 374],
  ["Prep At Home LLC", "2026-10-12", "Induwara Piyumal", "19217557", "Wp maintenance", "0:09:31", 397],
  ["WSI Web Enhancers", "2026-10-12", "Induwara Piyumal", "19251121", "Wp Maintenance", "0:09:53", 412],
  ["WSI Web Enhancers", "2026-10-13", "Induwara Piyumal", "19646614", "layout issues - ULXS-1254", "0:08:39", 360],
  ["WSI Web Enhancers", "2026-10-18", "Anupa Kaluarachchi", "14465394", "Meetings, Minor Tasks, Emails, & QA", "10:00:00", 25000, true],
];

function durationMs(clock: string) {
  const [hours, minutes, seconds] = clock.split(":").map((part) => Number(part));
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

export function referenceActivityLines(): ActivityLine[] {
  return ROWS.map(([project, date, member, todoId, todo, clock, cents, manual]) => ({
    clientName: "Ulix Digital",
    clientId: "ulix",
    projectName: project,
    projectId: project,
    date,
    memberName: member,
    memberId: member,
    todoId,
    todoTitle: todo,
    durationMs: durationMs(clock),
    billableMs: durationMs(clock),
    amount: { currency: "USD", amountMinor: cents },
    note: "",
    manual: manual === true,
    edited: false,
  }));
}
