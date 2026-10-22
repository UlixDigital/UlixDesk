import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PermissionNote } from "@/components/permission-note";
import { ProjectTabs } from "@/components/project-tabs";
import { ProjectTodos } from "@/components/project-todos";
import { authCopy } from "@/lib/auth-copy";
import { getProject } from "@/lib/projects";
import { getCurrentUser } from "@/lib/session";
import { todoCopy } from "@/lib/todo-copy";
import { canAssignTodos, listProjectTodos } from "@/lib/todos";
import { listActiveUsers } from "@/lib/users";

type TodosPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: TodosPageProps): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  return { title: project ? `${todoCopy.tab} · ${project.name}` : "Project not found" };
}

export default async function ProjectTodosPage({ params }: TodosPageProps) {
  const user = await getCurrentUser();
  if (!user) return <PermissionNote message={authCopy.manageDenied} />;
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const canAssign = canAssignTodos(user.role);
  const [todos, people] = await Promise.all([
    listProjectTodos(user, project.id),
    canAssign ? listActiveUsers() : Promise.resolve([]),
  ]);

  return (
    <div>
      <ProjectTabs projectId={project.id} current="todos" />
      <p className="text-sm text-slate-500">
        <Link href="/projects" className="hover:text-accent">
          Projects
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{project.name}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">{todoCopy.body}</p>
      <div className="mt-6">
        <ProjectTodos
          projectId={project.id}
          todos={todos.map((todo) => ({
            id: todo.id,
            title: todo.title,
            description: todo.description,
            status: todo.status,
            archivedAt: todo.archivedAt ? todo.archivedAt.toISOString() : null,
            assignees: todo.assignees,
            timeCount: todo.timeCount,
          }))}
          people={people.map((person) => ({ id: person.id, name: person.name }))}
          canAssign={canAssign}
          actorId={user.id}
        />
      </div>
    </div>
  );
}
