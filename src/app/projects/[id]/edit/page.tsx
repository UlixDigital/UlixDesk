import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { saveProjectAction } from "@/app/projects/actions";
import { saveProjectRateAction } from "@/app/rates/actions";
import { PermissionNote } from "@/components/permission-note";
import { BillRateForm } from "@/components/bill-rate-form";
import { RateHistory } from "@/components/rate-history";
import { ProjectForm } from "@/components/project-form";
import { authCopy } from "@/lib/auth-copy";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";
import { RestoreButton } from "@/components/project-row-actions";
import { TrackedTime } from "@/components/tracked-time";
import { listRateHistory, summarizeBillableMoney } from "@/lib/bill-rates";
import { rateCopy } from "@/lib/rate-copy";
import { projectsHref, type ClientOption } from "@/lib/project-display";
import { getProject, listClientChoices } from "@/lib/projects";
import { prisma } from "@/lib/db";
import { trackedMsForProject } from "@/lib/time-entries";

type EditPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: EditPageProps): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  return { title: project ? `Edit ${project.name}` : "Project not found" };
}

export default async function EditProjectPage({ params }: EditPageProps) {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) {
    return <PermissionNote message={authCopy.manageDenied} />;
  }
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [choices, trackedMs, projectRates, billingClient, money] = await Promise.all([
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
  ]);
  const today = new Date().toISOString().slice(0, 10);
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
                  projectId={project.id}
                />
                <RateHistory rows={projectRates} empty={rateCopy.historyEmpty} />
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
