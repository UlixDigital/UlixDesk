import type { Metadata } from "next";
import { SetPasswordForm } from "@/app/set-password/set-password-form";
import { authCopy, setupIntro } from "@/lib/auth-copy";
import { lookupSetupToken } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set your password",
};

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? "";
  const setup = token ? await lookupSetupToken(token) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8] px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{authCopy.setupTitle}</h1>
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
