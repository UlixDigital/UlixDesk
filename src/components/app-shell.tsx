import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { TimerBar } from "@/components/timer-bar";
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
        <AppSidebar
          name={user.name}
          role={roleLabel(user.role)}
          showTeam={canManageWorkspace(user.role)}
        />
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
