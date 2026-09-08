// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST, PUT } from "./route";
import { requireProject } from "@/lib/auth";
import { parseMdrWorkbook } from "@/lib/processor";

vi.mock("@/lib/auth", () => ({ requireProject: vi.fn() }));
vi.mock("@/lib/processor", () => ({ parseMdrWorkbook: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const organisationId = "a0000000-0000-4000-8000-000000000001";
const projectId = "a1000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ organisationId, projectId }) };
const row = {
  row_number: 2, document_number: "DOC-01", title: "Equipment Layout",
  document_type: "Equipment Layout Study", discipline: "Process",
  planned_submission_date: "2026-10-01", progress_weight: 1,
};
const categories = [{ code: "PRO", name: "Process", kind: "discipline" }];
let lifecycle = "archived";
let queries: { table: string; filters: Record<string, unknown> }[];
const rpc = vi.fn();

function projectAccess(role = "document_controller") {
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    queries.push({ table, filters });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((key: string, value: unknown) => { filters[key] = value; return query; }),
      limit: vi.fn().mockReturnThis(),
      then(resolve: (value: unknown) => unknown) {
        // Without the active filter, the removed number would block reuse.
        const documents = !filters.lifecycle_status || filters.lifecycle_status === lifecycle
          ? [{ document_number: "DOC-01" }] : [];
        return Promise.resolve({ data: table === "documents" ? documents : categories, error: null }).then(resolve);
      },
    };
    return query;
  });
  vi.mocked(requireProject).mockResolvedValue({ access: { role }, supabase: { from, rpc } } as never);
}

function previewRequest() {
  const form = new FormData();
  form.set("file", new File(["workbook"], "mdr.xlsx"));
  return new Request("https://example.test/import", { method: "POST", body: form });
}
function commitRequest(rows = [row]) {
  return new Request("https://example.test/import", { method: "PUT", body: JSON.stringify({ rows }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  queries = [];
  lifecycle = "archived";
  projectAccess();
  rpc.mockResolvedValue({ data: { created_count: 1 }, error: null });
  vi.mocked(parseMdrWorkbook).mockResolvedValue({ rows: [row], sheet_name: "MDR Import", row_count: 1 } as never);
});

describe("MDR import lifecycle and custom types", () => {
  it("previews and imports a removed number with an unlisted type", async () => {
    const preview = await POST(previewRequest(), context);
    expect(preview.status).toBe(200);
    expect((await preview.json()).canImport).toBe(true);
    const saved = await PUT(commitRequest(), context);
    expect(saved.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("bulk_create_mdr_documents", expect.objectContaining({
      target_organisation: organisationId, target_project: projectId,
      import_rows: [expect.objectContaining({ document_number: "DOC-01", document_type: "Equipment Layout Study" })],
    }));
    const documents = queries.filter(query => query.table === "documents");
    expect(documents).toHaveLength(2);
    documents.forEach(query => expect(query.filters).toEqual({
      organisation_id: organisationId, project_id: projectId, lifecycle_status: "active",
    }));
  });

  it("rejects active duplicates in both preview and final validation", async () => {
    lifecycle = "active";
    const preview = await POST(previewRequest(), context);
    expect((await preview.json()).canImport).toBe(false);
    expect((await PUT(commitRequest(), context)).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rechecks numbers claimed after the preview", async () => {
    expect((await (await POST(previewRequest(), context)).json()).canImport).toBe(true);
    lifecycle = "active";
    expect((await PUT(commitRequest(), context)).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports a concurrent database uniqueness conflict without retrying or overwriting", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505" } });
    const response = await PUT(commitRequest(), context);
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toContain("active MDR");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each(["engineer", "project_admin", "organisation_admin", "viewer"])("denies %s registration", async role => {
    projectAccess(role);
    expect((await POST(previewRequest(), context)).status).toBe(403);
    expect((await PUT(commitRequest(), context)).status).toBe(403);
    expect(parseMdrWorkbook).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
