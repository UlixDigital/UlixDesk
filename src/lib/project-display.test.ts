import { describe, expect, it } from "vitest";
import { countLabel } from "@/lib/client-display";
import {
  clientProjectsEmptyCopy,
  emptyProjectStateKind,
  matchingProjectsLabel,
  parseProjectStatus,
  projectCountLabel,
  projectEmptyCopy,
  projectsClearHref,
  projectsHref,
} from "@/lib/project-display";

describe("project count labels", () => {
  it("uses the shared pluralization helper", () => {
    expect(projectCountLabel(0)).toBe(countLabel(0, "project"));
    expect(projectCountLabel(1)).toBe("1 project");
    expect(projectCountLabel(2)).toBe("2 projects");
  });

  it("pluralizes search and client-filter summaries", () => {
    expect(matchingProjectsLabel(1, "site")).toBe(
      "1 project matching “site”",
    );
    expect(matchingProjectsLabel(3, "site")).toBe(
      "3 projects matching “site”",
    );
    expect(matchingProjectsLabel(1, "", "Acme")).toBe("1 project for Acme");
    expect(matchingProjectsLabel(2, "site", "Acme")).toBe(
      "2 projects matching “site” for Acme",
    );
  });
});

describe("emptyProjectStateKind", () => {
  it("covers an empty directory, an empty archive, and a search or filter miss", () => {
    expect(
      emptyProjectStateKind({
        status: "active",
        query: "",
        clientId: "",
        visibleCount: 0,
        otherCount: 0,
      }),
    ).toBe("no-projects");

    expect(
      emptyProjectStateKind({
        status: "active",
        query: "",
        clientId: "",
        visibleCount: 0,
        otherCount: 2,
      }),
    ).toBe("no-active");

    expect(
      emptyProjectStateKind({
        status: "archived",
        query: "  ",
        clientId: "",
        visibleCount: 0,
        otherCount: 3,
      }),
    ).toBe("no-archived");

    expect(
      emptyProjectStateKind({
        status: "active",
        query: "site",
        clientId: "",
        visibleCount: 0,
        otherCount: 4,
      }),
    ).toBe("no-matches");

    expect(
      emptyProjectStateKind({
        status: "active",
        query: "",
        clientId: "client-1",
        visibleCount: 0,
        otherCount: 4,
      }),
    ).toBe("no-matches");

    expect(
      emptyProjectStateKind({
        status: "archived",
        query: "",
        clientId: "",
        visibleCount: 1,
        otherCount: 0,
      }),
    ).toBeNull();
  });
});

describe("project empty copy", () => {
  it("uses the directory, archive, and filter messages", () => {
    expect(
      projectEmptyCopy({ kind: "no-projects", query: "", clientFiltered: false }),
    ).toEqual({
      title: "No projects yet",
      body: "Add a project to organize the work you track time for. A name is enough to start.",
      clearLabel: null,
    });

    expect(
      projectEmptyCopy({ kind: "no-archived", query: "", clientFiltered: false }),
    ).toEqual({
      title: "No archived projects",
      body: "When you archive a project, it leaves Active and stays here until you restore it.",
      clearLabel: null,
    });

    expect(
      projectEmptyCopy({ kind: "no-active", query: "", clientFiltered: false }),
    ).toEqual({
      title: "No active projects",
      body: "Every project on this tab has been archived. Restore one from the Archived tab, or add a new project.",
      clearLabel: null,
    });

    expect(
      projectEmptyCopy({
        kind: "no-matches",
        query: "site",
        clientFiltered: false,
      }),
    ).toEqual({
      title: "No projects match “site”",
      body: "Search checks project names on this tab. Try a different name, or clear the search.",
      clearLabel: "Clear search",
    });

    expect(
      projectEmptyCopy({ kind: "no-matches", query: "", clientFiltered: true }),
    ).toEqual({
      title: "No projects for this client",
      body: "No projects on this tab are linked to the selected client. Choose another client, or clear the filter.",
      clearLabel: "Clear filter",
    });

    expect(
      projectEmptyCopy({
        kind: "no-matches",
        query: "site",
        clientFiltered: true,
      }),
    ).toEqual({
      title: "No projects match “site”",
      body: "Nothing on this tab matches that name for the selected client. Try a different name, or clear the filters.",
      clearLabel: "Clear filters",
    });

    expect(clientProjectsEmptyCopy("Acme")).toEqual({
      title: "No projects for this client",
      body: "Projects linked to Acme will appear here.",
    });
  });
});

describe("project links", () => {
  it("keeps the tab, the search query, and the client filter in the href", () => {
    expect(parseProjectStatus(undefined)).toBe("active");
    expect(parseProjectStatus("nope")).toBe("active");
    expect(parseProjectStatus("archived")).toBe("archived");
    expect(projectsHref("active", "  site  ", "client-1")).toBe(
      "/projects?q=site&client=client-1",
    );
    expect(projectsHref("archived", "site")).toBe(
      "/projects?status=archived&q=site",
    );
    expect(projectsHref("archived")).toBe("/projects?status=archived");
    expect(projectsClearHref("active", "site", "client-1", "Clear search")).toBe(
      "/projects?client=client-1",
    );
    expect(projectsClearHref("archived", "site", "client-1", "Clear filter")).toBe(
      "/projects?status=archived&q=site",
    );
    expect(projectsClearHref("active", "site", "client-1", "Clear filters")).toBe(
      "/projects",
    );
  });
});
