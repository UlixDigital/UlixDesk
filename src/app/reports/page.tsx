import type { Metadata } from "next";
import Link from "next/link";
import { reportCopy } from "@/lib/report-copy";
import { reportDescription, reportKinds, reportTitle } from "@/lib/report-query";
import { timeChangeCopy } from "@/lib/time-change-copy";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";

export const metadata: Metadata = {
  title: reportCopy.pageTitle,
};

const cards = [
  ...reportKinds.map((kind) => ({
    href: `/reports/${kind}`,
    title: reportTitle(kind),
    body: reportDescription(kind),
  })),
  {
    href: "/reports/manual-time-edits",
    title: timeChangeCopy.pageTitle,
    body: reportCopy.timeEditsBody,
  },
];

export default async function ReportsPage() {
  const actor = await getCurrentUser();
  if (!actor) return null;
  const manager = canManageWorkspace(actor.role);
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{reportCopy.pageTitle}</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        {manager ? reportCopy.allScope : reportCopy.ownScope} {reportCopy.intro}
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="block h-full rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-[0_1px_2px_rgba(16,27,45,0.05)] hover:border-primary-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <h2 className="text-base font-semibold text-ink">{card.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{card.body}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
