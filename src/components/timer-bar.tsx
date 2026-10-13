import { TimerControls } from "@/components/timer-controls";
import { getCurrentUser } from "@/lib/session";
import {
  getRunningTimer,
  listActiveProjectsForPicker,
} from "@/lib/time-entries";
import { canManageWorkspace } from "@/lib/users-validation";

export async function TimerBar() {
  const user = await getCurrentUser();
  const [projects, timer] = await Promise.all([
    listActiveProjectsForPicker(),
    user ? getRunningTimer(user.id) : Promise.resolve(null),
  ]);

  return (
    <header
      aria-label="Timer"
      className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-3 sm:px-6">
        <TimerControls
          projects={projects.map((project) => ({
            id: project.id,
            name: project.name,
            clientName: project.clientName,
          }))}
          timer={
            timer
              ? {
                  projectName: timer.project.name,
                  clientName: timer.project.client?.name ?? null,
                  startedAt: timer.startedAt.toISOString(),
                }
              : null
          }
          serverNow={Date.now()}
          canManage={user ? canManageWorkspace(user.role) : false}
        />
      </div>
    </header>
  );
}
