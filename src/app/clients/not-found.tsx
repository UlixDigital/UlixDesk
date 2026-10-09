import Link from "next/link";
import { ui } from "@/lib/ui";

export default function ClientNotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">Client not found</h1>
      <p className="mt-2 text-sm text-slate-600">That client does not exist.</p>
      <Link href="/clients" className={`${ui.primaryButton} mt-6`}>
        Back to clients
      </Link>
    </div>
  );
}
