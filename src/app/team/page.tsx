import type { Metadata } from "next";
import { TeamPanel } from "@/app/team/team-panel";
import { PermissionNote } from "@/components/permission-note";
import { authCopy } from "@/lib/auth-copy";
import { getCurrentUser } from "@/lib/session";
import { listTeam } from "@/lib/users";
import { canManageWorkspace } from "@/lib/users-validation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team",
};

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) {
    return <PermissionNote message={authCopy.teamDenied} />;
  }
  const people = await listTeam();
  return (
    <TeamPanel
      actorId={user.id}
      actorRole={user.role}
      people={people.map((person) => ({
        id: person.id,
        name: person.name,
        email: person.email,
        role: person.role,
        deactivated: person.deactivatedAt !== null,
      }))}
    />
  );
}
