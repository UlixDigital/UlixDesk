import { countLabel } from "@/lib/client-display";

export type ProjectStatus = "active" | "archived";

export type ProjectEmptyKind =
  | "no-projects"
  | "no-active"
  | "no-archived"
  | "no-matches";

export type ClientOption = {
  id: string;
  name: string;
  archived: boolean;
};

export function parseProjectStatus(value: string | undefined): ProjectStatus {
  return value === "archived" ? "archived" : "active";
}

export function projectCountLabel(count: number) {
  return countLabel(count, "project");
}

export function matchingProjectsLabel(
  count: number,
  query: string,
  clientName?: string | null,
) {
  const base = projectCountLabel(count);
  const trimmed = query.trim();
  if (trimmed && clientName) {
    return `${base} matching “${trimmed}” for ${clientName}`;
  }
  if (trimmed) return `${base} matching “${trimmed}”`;
  if (clientName) return `${base} for ${clientName}`;
  return base;
}

export function projectsHref(
  status: ProjectStatus,
  query = "",
  clientId = "",
) {
  const params = new URLSearchParams();
  if (status === "archived") params.set("status", "archived");
  const trimmed = query.trim();
  if (trimmed) params.set("q", trimmed);
  if (clientId) params.set("client", clientId);
  const qs = params.toString();
  return qs ? `/projects?${qs}` : "/projects";
}

export function emptyProjectStateKind(input: {
  status: ProjectStatus;
  query: string;
  clientId: string;
  visibleCount: number;
  otherCount: number;
}): ProjectEmptyKind | null {
  if (input.visibleCount > 0) return null;
  if (input.query.trim() || input.clientId) return "no-matches";
  if (input.status === "archived") return "no-archived";
  if (input.otherCount > 0) return "no-active";
  return "no-projects";
}

export function projectEmptyCopy(input: {
  kind: ProjectEmptyKind;
  query: string;
  clientFiltered: boolean;
}) {
  if (input.kind === "no-matches") {
    const query = input.query.trim();
    if (query && input.clientFiltered) {
      return {
        title: `No projects match “${query}”`,
        body: "Nothing on this tab matches that name for the selected client. Try a different name, or clear the filters.",
        clearLabel: "Clear filters",
      };
    }
    if (query) {
      return {
        title: `No projects match “${query}”`,
        body: "Search checks project names on this tab. Try a different name, or clear the search.",
        clearLabel: "Clear search",
      };
    }
    return {
      title: "No projects for this client",
      body: "No projects on this tab are linked to the selected client. Choose another client, or clear the filter.",
      clearLabel: "Clear filter",
    };
  }

  if (input.kind === "no-archived") {
    return {
      title: "No archived projects",
      body: "When you archive a project, it leaves Active and stays here until you restore it.",
      clearLabel: null,
    };
  }

  if (input.kind === "no-active") {
    return {
      title: "No active projects",
      body: "Every project on this tab has been archived. Restore one from the Archived tab, or add a new project.",
      clearLabel: null,
    };
  }

  return {
    title: "No projects yet",
    body: "Add a project to organize the work you track time for. A name is enough to start.",
    clearLabel: null,
  };
}

export function clientProjectsEmptyCopy(clientName: string) {
  return {
    title: "No projects for this client",
    body: `Projects linked to ${clientName} will appear here.`,
  };
}

export function projectsClearHref(
  status: ProjectStatus,
  query: string,
  clientId: string,
  clearLabel: string,
) {
  if (clearLabel === "Clear search") return projectsHref(status, "", clientId);
  if (clearLabel === "Clear filter") return projectsHref(status, query, "");
  return projectsHref(status);
}
