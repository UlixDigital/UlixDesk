import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SetPasswordForm } from "@/app/set-password/set-password-form";
import { authCopy, setupIntro } from "@/lib/auth-copy";
import { readSession } from "@/lib/session";
import { lookupSetupToken } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set your password",
};

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; resumed?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";
  if (params.resumed !== "1") {
    const read = await readSession();
    if (read.status !== "anonymous") {
      const search = new URLSearchParams();
      if (token) search.set("token", token);
      search.set("resumed", "1");
      redirect(`/session/clear?next=${encodeURIComponent(`/set-password?${search.toString()}`)}`);
    }
  }
  const setup = token ? await lookupSetupToken(token) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8] px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{authCopy.setupTitle}</h1>
        {params.resumed === "1" ? (
          <p role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
            {authCopy.signedOutForPasswordLink}
          </p>
        ) : null}
        {setup ? (
          <>
            <p className="mt-1 text-sm text-slate-600">{setupIntro(setup.user.email)}</p>
            <SetPasswordForm token={token} />
          </>
        ) : (
          <p role="alert" className="mt-4 text-sm text-rose-800">
            {authCopy.setupInvalid}
          </p>
        )}
      </div>
    </div>
  );
}
