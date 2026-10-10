import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { saveClientAction } from "@/app/clients/actions";
import { ClientForm } from "@/components/client-form";
import { RestoreButton } from "@/components/client-row-actions";
import { ClientProjects } from "@/components/client-projects";
import { TrackedTime } from "@/components/tracked-time";
import { clientsHref } from "@/lib/client-display";
import { getClient } from "@/lib/clients";
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
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();
  const [projects, trackedMs] = await Promise.all([
    listProjectsForClient(client.id),
    trackedMsForClient(client.id),
  ]);

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
          <TrackedTime milliseconds={trackedMs} />
          <ClientProjects clientName={client.name} projects={projects} />
        </div>
      }
    />
  );
}
