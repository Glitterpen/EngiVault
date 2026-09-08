// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { requireProject } from "@/lib/auth";
import { sendInvitationEmail } from "@/lib/invitation-email";
vi.mock("@/lib/auth", () => ({ requireProject: vi.fn() }));
vi.mock("@/lib/invitation-email", () => ({ sendInvitationEmail: vi.fn() }));
vi.mock("@/lib/invitation-token", () => ({ createInvitationToken: vi.fn().mockResolvedValue({ raw: "test-only-token", tokenHash: "test-only-hash", expiresAt: "2026-10-01" }) }));
const organisationId = "org-a";
const projectId = "project-a";
const context = { params: Promise.resolve({ organisationId, projectId }) };
const rpc = vi.fn();
function access(role = "project_admin") {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { name: "Test project" } }) };
  vi.mocked(requireProject).mockResolvedValue({ access: { role }, supabase: { rpc, from: vi.fn().mockReturnValue(query) } } as never);
}
function request(discipline = "ROT") {
  return new Request("https://example.test/invite", { method: "POST", body: JSON.stringify({ email: "engineer@example.test", role: "engineer", discipline }) });
}
beforeEach(() => {
  vi.clearAllMocks(); access();
  vi.mocked(sendInvitationEmail).mockResolvedValue({ sent: true });
  rpc.mockImplementation((name: string) => {
    if (name === "get_project_document_categories") return Promise.resolve({ data: [{ kind: "discipline", name: "Rotating Equipment", code: "ROT" }], error: null });
    if (name === "create_project_invitation") return { single: vi.fn().mockResolvedValue({ data: { invitation_id: "test-invite", email: "engineer@example.test", project_role: "engineer", expires_at: "2026-10-01" }, error: null }) };
    return { maybeSingle: vi.fn().mockResolvedValue({ data: { organisation_name: "Test organisation", project_name: "Test project" }, error: null }) };
  });
});
describe("Invitations for project disciplines", () => {
  it("uses PM-created discipline codes without consulting only organisation categories", async () => {
    expect((await POST(request(), context)).status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("get_project_document_categories", { target_organisation: organisationId, target_project: projectId });
    expect(rpc).toHaveBeenCalledWith("create_project_invitation", expect.objectContaining({ target_discipline: "Rotating Equipment" }));
    expect(sendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({ discipline: "Rotating Equipment" }));
  });
  it.each(["document_controller", "engineer", "organisation_admin"])("does not allow %s to invite discipline engineers", async role => {
    access(role);
    expect((await POST(request(), context)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });
  it("does not invent an engineer discipline during invitation", async () => {
    expect((await POST(request("Not registered"), context)).status).toBe(422);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });
  it("fails closed if project categories are unavailable", async () => {
    rpc.mockResolvedValue({ error: { code: "42501" }, data: null });
    expect((await POST(request(), context)).status).toBe(503);
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });
});
