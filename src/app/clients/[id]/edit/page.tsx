import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PermissionNote } from "@/components/permission-note";
import { saveClientAction } from "@/app/clients/actions";
import { saveClientRateAction, saveMemberRateAction } from "@/app/rates/actions";
import { ClientForm } from "@/components/client-form";
import { RestoreButton } from "@/components/client-row-actions";
import { ClientProjects } from "@/components/client-projects";
import { BillRateForm } from "@/components/bill-rate-form";
import { RateHistory } from "@/components/rate-history";
import { TrackedTime } from "@/components/tracked-time";
import { authCopy } from "@/lib/auth-copy";
import { clientsHref } from "@/lib/client-display";
import { listRateHistory, summarizeBillableMoney } from "@/lib/bill-rates";
import { getClient } from "@/lib/clients";
import { rateCopy } from "@/lib/rate-copy";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";
import { listActiveUsers } from "@/lib/users";
import { listProjectsForClient } from "@/lib/projects";
import { trackedMsForClient } from "@/lib/time-entries";

type EditPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: EditPageProps): Promise<Metadata> {
  const { id } = await params;
  const client = await getClient(id);
  return { title: client ? `Edit ${client.name}` : "Client not found" };
}

export default async function EditClientPage({ params }: EditPageProps) {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) {
    return <PermissionNote message={authCopy.manageDenied} />;
  }
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();
  const [projects, trackedMs, clientRates, memberRates, members, money] = await Promise.all([
    listProjectsForClient(client.id),
    trackedMsForClient(client.id),
    listRateHistory({ scope: "client", clientId: client.id }),
    listRateHistory({ scope: "member", clientId: client.id }),
    listActiveUsers(),
    summarizeBillableMoney({ clientId: client.id }, user.role),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  const archived = client.archivedAt !== null;

  return (
    <ClientForm
      key={client.id}
      action={saveClientAction}
      clientId={client.id}
      initialState={{
        errors: {},
        values: {
          name: client.name,
          address: client.address ?? "",
          phone: client.phone ?? "",
          emails: client.emails,
          emailDraft: "",
          currency: client.currency,
        },
      }}
      title="Edit client"
      description={`Update contact details for ${client.name}.`}
      submitLabel="Save changes"
      cancelHref={clientsHref(archived ? "archived" : "active")}
      badge={archived ? "Archived" : "Active"}
      banner={
        archived ? (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-950">
              This client is archived. Restore them to show this client on the
              Active tab.
            </p>
            <RestoreButton id={client.id} name={client.name} />
          </div>
        ) : null
      }
      after={
        <div className="space-y-8">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,27,45,0.05)] sm:p-6">
            <h2 className="text-lg font-semibold text-ink">{rateCopy.clientRateTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">{rateCopy.clientRateBody}</p>
            <p className="mt-2 text-sm text-slate-600">{rateCopy.precedence}</p>
            <BillRateForm
              action={saveClientRateAction}
              today={today}
              currency={client.currency}
              clientId={client.id}
            />
            <RateHistory rows={clientRates} empty={rateCopy.historyEmpty} />
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,27,45,0.05)] sm:p-6">
            <h2 className="text-lg font-semibold text-ink">{rateCopy.memberRateTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">{rateCopy.memberRateBody}</p>
            <BillRateForm
              action={saveMemberRateAction}
              today={today}
              currency={client.currency}
              clientId={client.id}
              members={members.map((member) => ({ id: member.id, name: member.name }))}
            />
            <RateHistory rows={memberRates} empty={rateCopy.memberHistoryEmpty} />
          </section>
          <TrackedTime milliseconds={trackedMs} money={money} />
          <ClientProjects clientName={client.name} projects={projects} />
        </div>
      }
    />
  );
}
