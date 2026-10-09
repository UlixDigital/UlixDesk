import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <AppShell>
      <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          That page does not exist.
        </p>
        <Link href="/clients" className={`${ui.primaryButton} mt-6`}>
          Back to clients
        </Link>
      </div>
    </AppShell>
  );
}
