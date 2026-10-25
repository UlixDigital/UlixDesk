import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { TimerBar } from "@/components/timer-bar";
import { cn } from "@/lib/cn";
import { requireUser } from "@/lib/auth";
import { canManageWorkspace, roleLabel } from "@/lib/users-validation";

export async function AppShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  const user = await requireUser();
  const frame = wide ? "mx-auto w-full max-w-[1240px]" : "mx-auto w-full max-w-5xl";
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
        <div className="min-w-0 max-w-full">
          <TimerBar frameClass={frame} wide={wide} />
          <main
            id="main-content"
            className={cn(frame, "min-w-0 overflow-x-clip px-4 py-6 sm:px-6 sm:py-8", wide && "lg:px-8")}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
