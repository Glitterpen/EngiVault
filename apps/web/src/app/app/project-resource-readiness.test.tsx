import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import TeamPage from "./[organisationId]/projects/[projectId]/team/page";
import ProjectOverview from "./[organisationId]/projects/[projectId]/overview/page";
import { requireProject } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({ requireProject: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirect"); }) }));
vi.mock("@/app/app/workflow-actions", () => ({ setMemberDiscipline: vi.fn(), setMemberRole: vi.fn(), setProjectIssueStatus: vi.fn() }));
vi.mock("@/components/project-invite-dialog", () => ({ ProjectInviteDialog: () => null }));
vi.mock("@/components/pending-project-invitations", () => ({ PendingProjectInvitations: () => null }));
vi.mock("@/components/project-member-remove", () => ({ ProjectMemberRemove: () => null }));
vi.mock("@/components/project-discipline-manager", () => ({ ProjectDisciplineManager: () => null }));
vi.mock("@/components/project-management-forms", () => ({ ResourcePlanForm: () => null, EditableProjectBrief: () => null, ProjectIssueForm: () => null }));
vi.mock("@/components/project-logo", () => ({ ProjectLogo: () => null }));
vi.mock("@/components/revision-cycle-form", () => ({ RevisionCycleForm: () => null }));

const organisationId = "a0000000-0000-4000-8000-000000000001";
const projectId = "b0000000-0000-4000-8000-000000000001";
const params = Promise.resolve({ organisationId, projectId });
const plans = [
  { id: "mechanical", discipline: "Mechanical", required_count: 4, notes: "Retained mechanical plan" },
  { id: "process", discipline: "Process", required_count: 2, notes: "Current process plan" },
];
const members = [
  { user_id: "mechanical-engineer", display_name: "Mechanical Engineer Ada", email: "ada@example.test", role: "engineer", disciplines: ["Mechanical"] },
  { user_id: "process-engineer", display_name: "Process Engineer Sam", email: "sam@example.test", role: "engineer", disciplines: ["Process"] },
];

function setup({ disciplines = ["Process"], role = "project_admin", preview = false, failed = "" } = {}) {
  const tables: Record<string, unknown> = {
    projects: { id: projectId, name: "Test project", code: "TEST", delivery_stage: "feed" },
    project_resource_plans: plans,
    project_disciplines: [{ name: "Mechanical", code: "MEC" }],
  };
  const queries: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};
  const from = vi.fn((table: string) => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq", "order", "single"]) query[method] = vi.fn(() => query);
    query.then = vi.fn(resolve => Promise.resolve({ data: tables[table] ?? [], error: failed === table ? { code: "XX000" } : null }).then(resolve));
    queries[table] = query;
    return query;
  });
  const rpc = vi.fn((name: string) => Promise.resolve({
    data: name === "get_project_team" ? members : name === "get_project_document_categories"
      ? disciplines.map(name => ({ kind: "discipline", code: "", name })) : [],
    error: failed === name ? { code: "XX000" } : null,
  }));
  vi.mocked(requireProject).mockResolvedValue({
    access: { role }, user: { id: "manager" }, preview: preview ? {} : null, supabase: { from, rpc },
  } as never);
  return { from, rpc, queries };
}

function readiness() {
  return within(screen.getByRole("heading", { name: /^Discipline resource readiness/ }).closest("article")!);
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("discipline removal reflected in live resource readiness", () => {
  it("updates team readiness and position totals while preserving the engineer's existing access", async () => {
    const { rpc, queries } = setup();
    render(await TeamPage({ params }));
    expect(readiness().queryByRole("heading", { name: "Mechanical" })).toBeNull();
    expect(readiness().getByRole("heading", { name: "Process" })).toBeTruthy();
    expect(readiness().getByText("1 position open")).toBeTruthy();
    expect(within(screen.getByText("Planned positions").closest("article")!).getByText("2")).toBeTruthy();
    expect(within(screen.getByText("Unfilled positions").closest("article")!).getByText("1")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Mechanical Engineer Ada" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Mechanical access from Mechanical Engineer Ada" })).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("get_project_document_categories", { target_organisation: organisationId, target_project: projectId });
    expect(queries.project_resource_plans.eq).toHaveBeenCalledWith("organisation_id", organisationId);
    expect(queries.project_resource_plans.eq).toHaveBeenCalledWith("project_id", projectId);
  });

  it.each(["project_admin", "organisation_admin"])("updates overview readiness for %s without reducing actual engineer membership", async role => {
    setup({ role });
    render(await ProjectOverview({ params }));
    expect(readiness().queryByRole("heading", { name: "Mechanical" })).toBeNull();
    expect(readiness().getByRole("heading", { name: "Process" })).toBeTruthy();
    expect(screen.getByText("2 engineers")).toBeTruthy();
  });

  it("uses the same filtered readiness in the live PM preview", async () => {
    setup({ preview: true });
    render(await ProjectOverview({ params }));
    expect(readiness().queryByText("Retained mechanical plan")).toBeNull();
    expect(readiness().getByText("Current process plan")).toBeTruthy();
  });

  for (const [name, Page] of [["team", TeamPage], ["overview", ProjectOverview]] as const) {
    it(`restores existing readiness on ${name} when a discipline is restored`, async () => {
      setup();
      const view = render(await Page({ params }));
      expect(readiness().queryByRole("heading", { name: "Mechanical" })).toBeNull();
      setup({ disciplines: ["Mechanical", "Process"] });
      view.rerender(await Page({ params }));
      expect(readiness().getByRole("heading", { name: "Mechanical" })).toBeTruthy();
      expect(readiness().getByText("Retained mechanical plan")).toBeTruthy();
    });

    it(`shows no stale readiness on ${name} after all disciplines are removed`, async () => {
      setup({ disciplines: [] });
      render(await Page({ params }));
      expect(readiness().queryByRole("heading", { name: "Mechanical" })).toBeNull();
      expect(readiness().queryByRole("heading", { name: "Process" })).toBeNull();
      expect(readiness().getByText(/No discipline/)).toBeTruthy();
    });

    it.each(["get_project_document_categories", "project_resource_plans"])(`does not report misleading readiness on ${name} when %s fails`, async failed => {
      setup({ failed });
      await expect(Page({ params })).rejects.toThrow("Project resource readiness could not be loaded");
    });
  }
});
