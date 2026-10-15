import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { saveProjectAction } from "@/app/projects/actions";
import { saveProjectRateAction } from "@/app/rates/actions";
import { PermissionNote } from "@/components/permission-note";
import { BillRateForm } from "@/components/bill-rate-form";
import { BudgetForm } from "@/components/budget-form";
import { BudgetProgressView } from "@/components/budget-progress";
import { RateHistory } from "@/components/rate-history";
import { ProjectForm } from "@/components/project-form";
import { authCopy } from "@/lib/auth-copy";
import { budgetCopy } from "@/lib/budget-copy";
import { budgetFormValues, projectBudgetProgress } from "@/lib/budgets";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";
import { RestoreButton } from "@/components/project-row-actions";
import { TrackedTime } from "@/components/tracked-time";
import {
  getWorkspaceCurrency,
  getWorkspaceTimeZone,
  listRateHistory,
  summarizeBillableMoney,
} from "@/lib/bill-rates";
import { rateCopy } from "@/lib/rate-copy";
import { projectsHref, type ClientOption } from "@/lib/project-display";
import { getProject, listClientChoices } from "@/lib/projects";
import { prisma } from "@/lib/db";
import { trackedMsForProject } from "@/lib/time-entries";
import { todayInTimeZone } from "@/lib/time-zone";

type EditPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: EditPageProps): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return { title: "Project not found" };
  const user = await getCurrentUser();
  const manager = user ? canManageWorkspace(user.role) : false;
  return { title: manager ? `Edit ${project.name}` : project.name };
}

export default async function EditProjectPage({ params }: EditPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    return <PermissionNote message={authCopy.manageDenied} />;
  }
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const manager = canManageWorkspace(user.role);
  if (!manager) {
    const progress = await projectBudgetProgress({
      projectId: project.id,
      role: user.role,
      userId: user.id,
    });
    return (
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/projects" className="hover:text-accent">
            Projects
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{project.name}</h1>
        {project.description ? (
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{project.description}</p>
        ) : null}
        <p className="mt-2 text-sm text-slate-600">{project.client?.name ?? "No client"}</p>
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,27,45,0.05)] sm:p-6">
          <h2 className="text-lg font-semibold text-ink">{budgetCopy.title}</h2>
          {progress ? (
            <div className="mt-4">
              <BudgetProgressView progress={progress} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">{budgetCopy.memberEmpty}</p>
          )}
        </section>
      </div>
    );
  }

  const [choices, trackedMs, projectRates, billingClient, money, timeZone, progress, workspaceCurrency] =
    await Promise.all([
      listClientChoices(project.clientId),
      trackedMsForProject(project.id),
      listRateHistory({ scope: "project", projectId: project.id }),
      project.clientId
        ? prisma.client.findUnique({
            where: { id: project.clientId },
            select: { currency: true },
          })
        : Promise.resolve(null),
      summarizeBillableMoney({ projectId: project.id }, user.role),
      getWorkspaceTimeZone(),
      projectBudgetProgress({ projectId: project.id, role: user.role, userId: user.id }),
      getWorkspaceCurrency(),
    ]);
  const today = todayInTimeZone(timeZone);
  const clients: ClientOption[] = choices.map((client) => ({
    id: client.id,
    name: client.name,
    archived: client.archivedAt !== null,
  }));
  const archived = project.archivedAt !== null;

  return (
    <ProjectForm
      key={project.id}
      action={saveProjectAction}
      projectId={project.id}
      clients={clients}
      initialState={{
        errors: {},
        values: {
          name: project.name,
          description: project.description ?? "",
          clientId: project.clientId ?? "",
          billable: project.billable,
        },
      }}
      title="Edit project"
      description={`Update details for ${project.name}.`}
      submitLabel="Save changes"
      cancelHref={projectsHref(archived ? "archived" : "active")}
      badge={archived ? "Archived" : "Active"}
      banner={
        archived ? (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-950">
              This project is archived. Restore it to show this project on the
              Active tab.
            </p>
            <RestoreButton id={project.id} name={project.name} />
          </div>
        ) : null
      }
      after={
        <div className="space-y-8">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,27,45,0.05)] sm:p-6">
            <h2 className="text-lg font-semibold text-ink">{budgetCopy.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{budgetCopy.projectBody}</p>
            {billingClient ? null : (
              <p className="mt-2 text-sm text-slate-600">{budgetCopy.projectNeedsCurrency}</p>
            )}
            {progress ? (
              <div className="mt-4">
                <BudgetProgressView progress={progress} />
              </div>
            ) : null}
            <BudgetForm
              key={progress?.record.id ?? "new-project-budget"}
              scope="project"
              projectId={project.id}
              currency={billingClient?.currency ?? workspaceCurrency}
              initial={budgetFormValues(progress?.record ?? null)}
              hasBudget={progress !== null}
            />
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,27,45,0.05)] sm:p-6">
            <h2 className="text-lg font-semibold text-ink">{rateCopy.projectRateTitle}</h2>
            {billingClient ? (
              <>
                <p className="mt-1 text-sm text-slate-600">{rateCopy.projectRateBody}</p>
                {project.billable ? null : (
                  <p className="mt-2 text-sm text-slate-600">{rateCopy.projectNonBillable}</p>
                )}
                <BillRateForm
                  action={saveProjectRateAction}
                  today={today}
                  currency={billingClient.currency}
                  timeZone={timeZone}
                  projectId={project.id}
                />
                <RateHistory rows={projectRates} empty={rateCopy.historyEmpty} today={today} />
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-600">{rateCopy.projectNeedsClient}</p>
            )}
          </section>
          <TrackedTime milliseconds={trackedMs} money={money} />
        </div>
      }
    />
  );
}
