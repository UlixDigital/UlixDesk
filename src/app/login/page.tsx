import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { authCopy } from "@/lib/auth-copy";
import { safeNextPath } from "@/lib/access-decision";
import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; signedOut?: string; password?: string }>;
}) {
  const read = await readSession();
  const params = await searchParams;
  const next = safeNextPath(params.next ?? "/clients");
  if (read.status !== "anonymous") redirect(next);
  if (read.hadCookie) {
    const back = new URLSearchParams();
    if (params.signedOut === "1") back.set("signedOut", "1");
    if (params.password === "saved") back.set("password", "saved");
    if (next !== "/clients") back.set("next", next);
    const login = back.size > 0 ? `/login?${back.toString()}` : "/login";
    redirect(`/session/clear?next=${encodeURIComponent(login)}`);
  }

  const notice =
    params.signedOut === "1"
      ? authCopy.signedOut
      : params.password === "saved"
        ? authCopy.passwordSaved
        : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8] px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-700 text-base font-semibold text-white">
            U
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">UlixDesk</p>
            <p className="text-xs text-slate-500">Ulix Digital</p>
          </div>
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">
          {authCopy.signInTitle}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{authCopy.signInIntro}</p>
        <LoginForm next={next} notice={notice} />
      </div>
    </div>
  );
}
