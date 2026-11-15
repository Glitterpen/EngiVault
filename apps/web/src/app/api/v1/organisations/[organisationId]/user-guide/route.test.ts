// @vitest-environment node
import { readFile } from "node:fs/promises";
import { beforeEach, expect, it, vi } from "vitest";
import { readAdminPreview } from "@/lib/admin-preview";
import { requireProject, requireUser } from "@/lib/auth";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({ requireProject: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/lib/admin-preview", () => ({ readAdminPreview: vi.fn() }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return { ...original, readFile: vi.fn(original.readFile) };
});

const organisationId = "a0000000-0000-4000-8000-000000000001";
const projectId = "b0000000-0000-4000-8000-000000000001";
const missingOrganisation = "c0000000-0000-4000-8000-000000000001";
const projectParam = `?project=${projectId}`;
const url = "https://app.example.test/user-guide";
const get = (suffix = "", org = organisationId) => GET(new Request(`${url}${suffix}`), {
  params: Promise.resolve({ organisationId: org }),
});
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const rpc = vi.fn(() => ({ eq }));
const project = (actualRole: string, preview: unknown = null, role = actualRole) => {
  vi.mocked(requireProject).mockResolvedValue({ actualRole, access: { role }, preview } as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ supabase: { rpc } } as never);
  vi.mocked(readAdminPreview).mockResolvedValue(null);
  project("project_admin");
  maybeSingle.mockResolvedValue({ data: { role: "organisation_admin" }, error: null });
});

it.each([
  [null, "organisation-administrator"],
  ["project_admin", "project-manager"],
  ["document_controller", "document-controller"],
  ["engineer", "discipline-engineer"],
])("serves the %s guide as an inline PDF using the existing scope", async (role, guide) => {
  if (role) project(role);
  const response = await get(role ? projectParam : "");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("content-disposition")).toBe(`inline; filename="EngiCite-${guide}-user-guide.pdf"`);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  const pdf = await response.arrayBuffer();
  expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
  expect(response.headers.get("content-length")).toBe(String(pdf.byteLength));

  if (role) {
    expect(requireProject).toHaveBeenCalledWith(organisationId, projectId);
  } else {
    expect(rpc).toHaveBeenCalledWith("get_my_organisations");
    expect(eq).toHaveBeenCalledWith("organisation_id", organisationId);
  }
});

it("still accepts an explicit PDF format", async () => {
  const response = await get(`${projectParam}&format=pdf`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("content-disposition")).toBe('inline; filename="EngiCite-project-manager-user-guide.pdf"');
});

it("ignores caller-supplied roles and names", async () => {
  project("engineer");
  const response = await get(`${projectParam}&role=organisation_admin&guide=project-manager&filename=other.pdf`);
  expect(response.headers.get("content-disposition")).toContain("discipline-engineer");
});

it.each(["organisation_admin", "executive_viewer", "founder", "unknown"])(
  "does not give %s a project guide",
  async (role) => {
    project(role);
    expect((await get(projectParam)).status).toBe(403);
    expect(readFile).not.toHaveBeenCalled();
  },
);

it.each([
  { data: { role: "member" }, error: null },
  { data: null, error: null },
  { data: { role: "organisation_admin" }, error: { message: "private failure" } },
])("fails closed when the requested organisation cannot be authorised", async (result) => {
  maybeSingle.mockResolvedValue(result);
  expect((await get("", missingOrganisation)).status).toBe(403);
  expect(eq).toHaveBeenCalledWith("organisation_id", missingOrganisation);
  expect(readFile).not.toHaveBeenCalled();
});

it("does not serve guides while a role preview is active", async () => {
  const preview = { role: "document_controller" };
  project("organisation_admin", preview, preview.role);
  vi.mocked(readAdminPreview).mockResolvedValue(preview as never);
  expect((await get(projectParam)).status).toBe(403);
  expect((await get()).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
  expect(readFile).not.toHaveBeenCalled();
});

it("preserves existing authentication and project-access denials", async () => {
  const login = new Error("existing sign-in redirect");
  const denied = new Error("existing project-access denial");
  vi.mocked(requireUser).mockRejectedValueOnce(login);
  vi.mocked(requireProject).mockRejectedValueOnce(denied);
  await expect(get()).rejects.toBe(login);
  await expect(get(projectParam, missingOrganisation)).rejects.toBe(denied);
  expect(requireProject).toHaveBeenCalledWith(missingOrganisation, projectId);
  expect(readFile).not.toHaveBeenCalled();
});

it.each([
  ["", "not-an-organisation"],
  ["?project=", organisationId],
  ["?project=invalid", organisationId],
  ["?format=docx", organisationId],
  [`${projectParam}&format=docx`, organisationId],
  ["?format=pdf&format=docx", organisationId],
  ["?format=../secrets", organisationId],
])("rejects invalid scope and format before authorising or reading a file", async (suffix, org) => {
  expect((await get(suffix, org)).status).toBe(400);
  expect(requireUser).not.toHaveBeenCalled();
  expect(requireProject).not.toHaveBeenCalled();
  expect(readFile).not.toHaveBeenCalled();
});

it("does not leak storage details if the guide asset is missing", async () => {
  vi.mocked(readFile).mockRejectedValueOnce(new Error("secret filesystem path"));
  const response = await get();
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.text()).not.toContain("secret filesystem path");
});
