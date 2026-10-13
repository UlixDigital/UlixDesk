import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/login/actions";
import { AppNav } from "@/components/app-nav";
import { TimerBar } from "@/components/timer-bar";
import { authCopy } from "@/lib/auth-copy";
import { requireUser } from "@/lib/auth";
import { canManageWorkspace, roleLabel } from "@/lib/users-validation";

export async function AppShell({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="md:grid md:min-h-screen md:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="border-b border-white/10 bg-[#101b2d] text-white md:flex md:flex-col md:border-r md:border-b-0">
          <Link
            href="/clients"
            className="flex items-center gap-3 px-4 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400 md:px-5 md:py-5"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-700 text-base font-semibold text-white">
              U
            </span>
            <span>
              <span className="block text-sm font-semibold leading-tight">
                UlixDesk
              </span>
              <span className="block text-xs text-white/60">Ulix Digital</span>
            </span>
          </Link>
          <AppNav showTeam={canManageWorkspace(user.role)} />
          <div className="mt-2 border-t border-white/10 px-3 py-4 md:mt-auto">
            <p className="px-3 text-sm font-medium text-white">{user.name}</p>
            <p className="px-3 text-xs text-white/60">{roleLabel(user.role)}</p>
            <form action={logoutAction} className="mt-3">
              <button
                type="submit"
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400"
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
