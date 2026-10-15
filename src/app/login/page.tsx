import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { UlixLogo } from "@/components/ulix-logo";
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
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="brand-rule" aria-hidden="true" />
        <div className="px-6 py-8 sm:px-8">
        <UlixLogo height={48} />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">
          {authCopy.signInTitle}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{authCopy.signInIntro}</p>
        <LoginForm next={next} notice={notice} />
        </div>
      </div>
    </div>
  );
}
