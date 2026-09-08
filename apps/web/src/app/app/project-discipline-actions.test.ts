// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectDiscipline } from "./project-discipline-actions";
import { requireProject } from "@/lib/auth";
import { revalidatePath } from "next/cache";
vi.mock("@/lib/auth", () => ({ requireProject: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const rpc = vi.fn();
const organisationId = "a0000000-0000-4000-8000-000000000001";
const projectId = "a1000000-0000-4000-8000-000000000001";
function access(role = "project_admin") {
  vi.mocked(requireProject).mockResolvedValue({ access: { role }, supabase: { rpc } } as never);
}
function payload(name = "Rotating Equipment", code = "rot") {
  const body = new FormData();
  Object.entries({ organisationId, projectId, name, code }).forEach(([key, value]) => body.set(key, value));
  return body;
}
beforeEach(() => { vi.clearAllMocks(); access(); rpc.mockResolvedValue({ data: "Rotating Equipment", error: null }); });
describe("Project Manager discipline creation", () => {
  it("adds a project-scoped discipline and refreshes team/MDR", async () => {
    expect((await createProjectDiscipline(undefined, payload()))?.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("create_project_discipline", { target_organisation: organisationId, target_project: projectId, new_name: "Rotating Equipment", new_code: "ROT" });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/${organisationId}/projects/${projectId}/team`);
  });
  it.each(["document_controller", "engineer", "organisation_admin", "viewer"])("denies %s", async role => {
    access(role);
    expect((await createProjectDiscipline(undefined, payload()))?.ok).not.toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("allows an omitted code", async () => {
    await createProjectDiscipline(undefined, payload("X", ""));
    expect(rpc).toHaveBeenCalledWith("create_project_discipline", expect.objectContaining({ new_code: null, new_name: "X" }));
  });
  it.each([["", "ROT"], ["x".repeat(81), "ROT"], ["Rotating", "bad/code"]])("rejects invalid fields", async (name, code) => {
    expect((await createProjectDiscipline(undefined, payload(name, code)))?.ok).not.toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("explains duplicate codes", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505" } });
    expect((await createProjectDiscipline(undefined, payload()))?.message).toContain("short code is already used");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
