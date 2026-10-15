import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/login/actions";
import { AppNav } from "@/components/app-nav";
import { TimerBar } from "@/components/timer-bar";
import { UlixLogo } from "@/components/ulix-logo";
import { authCopy } from "@/lib/auth-copy";
import { requireUser } from "@/lib/auth";
import { canManageWorkspace, roleLabel } from "@/lib/users-validation";

export async function AppShell({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen bg-[#f4f6f8] text-ink">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="md:grid md:min-h-screen md:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-white text-ink md:flex md:flex-col md:border-r md:border-b-0">
          <Link
            href="/clients"
            className="block px-4 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:px-5 md:py-5"
          >
            <UlixLogo height={44} />
          </Link>
          <AppNav showTeam={canManageWorkspace(user.role)} />
          <div className="mt-2 border-t border-slate-200 px-3 py-4 md:mt-auto">
            <p className="px-3 text-sm font-medium text-ink">{user.name}</p>
            <p className="px-3 text-xs text-slate-500">{roleLabel(user.role)}</p>
            <form action={logoutAction} className="mt-3">
              <button
                type="submit"
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-primary-50 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {authCopy.signOut}
              </button>
            </form>
          </div>
        </aside>
        <div className="min-w-0">
          <TimerBar />
          <main
            id="main-content"
            className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
