import Link from "next/link";
import { cn } from "@/lib/cn";
import { todoCopy } from "@/lib/todo-copy";

export function ProjectTabs({
  projectId,
  current,
}: {
  projectId: string;
  current: "details" | "todos";
}) {
  return (
    <nav aria-label="Project" className="mb-6 border-b border-slate-200">
      <div className="-mb-px flex gap-6">
        <Tab href={`/projects/${projectId}/edit`} current={current === "details"}>
          {todoCopy.detailsTab}
        </Tab>
        <Tab href={`/projects/${projectId}/todos`} current={current === "todos"}>
          {todoCopy.tab}
        </Tab>
      </div>
    </nav>
  );
}

function Tab({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "border-b-2 px-1 pb-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
        current
          ? "border-accent text-accent"
          : "border-transparent text-slate-600 hover:border-slate-300 hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
