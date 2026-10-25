import { TimerControls } from "@/components/timer-controls";
import { getCurrentUser } from "@/lib/session";
import {
  getRunningTimer,
  listActiveProjectsForPicker,
} from "@/lib/time-entries";
import { listPickerTodos } from "@/lib/todos";
import { cn } from "@/lib/cn";
import { canManageWorkspace } from "@/lib/users-validation";

export async function TimerBar({
  frameClass = "mx-auto w-full max-w-5xl",
  wide = false,
}: {
  frameClass?: string;
  wide?: boolean;
}) {
  const user = await getCurrentUser();
  const [projects, timer, todos] = await Promise.all([
    listActiveProjectsForPicker(),
    user ? getRunningTimer(user.id) : Promise.resolve(null),
    user ? listPickerTodos(user) : Promise.resolve([]),
  ]);

  return (
    <header
      aria-label="Timer"
      className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur"
    >
      <div className={cn(frameClass, "px-4 py-3 sm:px-6", wide && "lg:px-8")}>
        <TimerControls
          projects={projects.map((project) => ({
            id: project.id,
            name: project.name,
            clientName: project.clientName,
          }))}
          todos={todos}
          timer={
            timer
              ? {
                  projectName: timer.project.name,
                  clientName: timer.project.client?.name ?? null,
                  todoTitle: timer.todo?.title ?? null,
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
