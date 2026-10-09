import Link from "next/link";
import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="md:grid md:min-h-screen md:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="border-b border-white/10 bg-[#101b2d] text-white md:border-r md:border-b-0">
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
          <AppNav />
        </aside>
        <div className="min-w-0">
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
