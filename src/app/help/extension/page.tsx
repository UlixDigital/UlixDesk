import type { Metadata } from "next";
import Link from "next/link";
import { ExtensionInstallGuide } from "@/components/extension-install-guide";
import { UlixLogo } from "@/components/ulix-logo";
import { authCopy } from "@/lib/auth-copy";

export const metadata: Metadata = {
  title: "Chrome extension",
  description: "How to install, pin, sign in, and update the UlixDesk Chrome extension.",
};

export default function ExtensionHelpPage() {
  return (
    <div className="min-h-screen bg-[#f4f6f8] text-ink">
      <a href="#extension-guide" className="skip-link">
        Skip to content
      </a>
      <div className="brand-rule" aria-hidden="true" />
      <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
        <Link
          href="/login"
          className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <UlixLogo height={44} />
        </Link>
        <Link
          href="/login"
          className="text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {authCopy.signInTitle}
        </Link>
      </header>
      <main id="extension-guide" className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6">
        <ExtensionInstallGuide />
      </main>
    </div>
  );
}
