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
    if (name === "get_project_document_categories") return Promise.resolve({ data: [{ kind: "discipline", name: "Rotating Equipment", code: "ROT" }, { kind: "discipline", name: "Electrical", code: "ELE" }, { kind: "discipline", name: "Instrumentation", code: "INS" }], error: null });
    if (name === "create_project_invitation_with_disciplines") return { single: vi.fn().mockResolvedValue({ data: { invitation_id: "test-invite", email: "engineer@example.test", project_role: "engineer", expires_at: "2026-10-01" }, error: null }) };
    return { maybeSingle: vi.fn().mockResolvedValue({ data: { organisation_name: "Test organisation", project_name: "Test project" }, error: null }) };
  });
});
describe("Invitations for project disciplines", () => {
  it("uses PM-created discipline codes without consulting only organisation categories", async () => {
    expect((await POST(request(), context)).status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("get_project_document_categories", { target_organisation: organisationId, target_project: projectId });
    expect(rpc).toHaveBeenCalledWith("create_project_invitation_with_disciplines", expect.objectContaining({ target_disciplines: ["Rotating Equipment"] }));
    expect(sendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({ disciplines: ["Rotating Equipment"] }));
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
  it("creates one invitation and sends one email for all canonical discipline scopes", async () => {
    const response=await POST(multiRequest(["ELE","Instrumentation"," electrical ","ROT"]),context);
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("create_project_invitation_with_disciplines",expect.objectContaining({target_disciplines:["Electrical","Instrumentation","Rotating Equipment"]}));
    expect(sendInvitationEmail).toHaveBeenCalledTimes(1);
    expect(sendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({disciplines:["Electrical","Instrumentation","Rotating Equipment"]}));
  });
  it.each([[],["Electrical","Unknown"],[""],[null],Array(101).fill("Electrical")])("rejects invalid selection %j atomically",async disciplines=>{
    expect((await POST(multiRequest(disciplines),context)).status).toBe(422);
    expect(rpc.mock.calls.some(([name])=>name==="create_project_invitation_with_disciplines")).toBe(false);
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });
  it("denies DCC multi-discipline invitations before any writes",async()=>{
    access("document_controller");
    expect((await POST(multiRequest(["Electrical","Instrumentation"]),context)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not accept conflicting scalar and array scopes",async()=>{
    const req=new Request("https://example.test/invite",{method:"POST",body:JSON.stringify({email:"engineer@example.test",role:"engineer",discipline:"ROT",disciplines:["ELE"]})});
    expect((await POST(req,context)).status).toBe(422);
  });
  it("does not attach engineer scopes to leadership invitations",async()=>{
    access("organisation_admin");
    expect((await POST(multiRequest(["Electrical"],"project_admin"),context)).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("retains the secure link when the email provider is unavailable",async()=>{
    vi.mocked(sendInvitationEmail).mockRejectedValue(new Error("Network unavailable"));
    const response=await POST(multiRequest(["Electrical","Instrumentation"]),context);
    expect(response.status).toBe(201);
    expect((await response.json()).delivery).toMatchObject({emailSent:false,reason:"provider_error"});
  });
});

function multiRequest(disciplines:unknown[],role="engineer"){
  return new Request("https://example.test/invite",{method:"POST",body:JSON.stringify({email:"engineer@example.test",role,disciplines})});
}
