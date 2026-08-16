import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions";
import { requireProject } from "@/lib/auth";
import {
  mdrImportPayloadSchema,
  type MdrImportRow,
  type ProcessorMdrRow,
  validateMdrPreview,
} from "@/lib/mdr-import";
import { parseMdrWorkbook } from "@/lib/processor";

const MAX_FILE_BYTES = 5_242_880;

export async function POST(
  request: Request,
  context: { params: Promise<{ organisationId: string; projectId: string }> },
) {
  const { organisationId, projectId } = await context.params;
  const { supabase, access } = await requireProject(organisationId, projectId);
  if (!can(String(access.role), "document:register")) {
    return Response.json({ error: { code: "FORBIDDEN", message: "Only the appointed Document Controller can import the MDR." } }, { status: 403 });
  }
  const body = await request.formData().catch(() => null);
  const file = body?.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_FILE_BYTES || !file.name.toLowerCase().endsWith(".xlsx")) {
    return Response.json({ error: { code: "INVALID_FILE", message: "Choose an Excel .xlsx file no larger than 5 MB." } }, { status: 422 });
  }

  try {
    const parsed = await parseMdrWorkbook(file);
    const [{ data: categories, error: categoryError }, { data: documents, error: documentError }] = await Promise.all([
      supabase.from("document_categories").select("code,name,kind").eq("organisation_id", organisationId).eq("is_active", true),
      supabase.from("documents").select("document_number").eq("organisation_id", organisationId).eq("project_id", projectId).limit(10_000),
    ]);
    if (categoryError || documentError) throw new Error("MDR validation data is unavailable.");
    const rows = validateMdrPreview(
      parsed.rows as ProcessorMdrRow[],
      categories ?? [],
      (documents ?? []).map((document) => String(document.document_number)),
    );
    const validCount = rows.filter((row) => row.is_valid).length;
    return Response.json({
      sheetName: parsed.sheet_name,
      rowCount: rows.length,
      validCount,
      errorCount: rows.length - validCount,
      canImport: rows.length > 0 && validCount === rows.length,
      rows,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: { code: "WORKBOOK_INVALID", message: error instanceof Error ? error.message : "The workbook could not be read." } }, { status: 422 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ organisationId: string; projectId: string }> },
) {
  const { organisationId, projectId } = await context.params;
  const { supabase, access } = await requireProject(organisationId, projectId);
  if (!can(String(access.role), "document:register")) {
    return Response.json({ error: { code: "FORBIDDEN", message: "Only the appointed Document Controller can import the MDR." } }, { status: 403 });
  }
  const parsed = mdrImportPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: { code: "INVALID_ROWS", message: "Review the workbook preview before importing." } }, { status: 422 });
  }
  const [{ data: categories, error: categoryError }, { data: documents, error: documentError }] = await Promise.all([
    supabase.from("document_categories").select("code,name,kind").eq("organisation_id", organisationId).eq("is_active", true),
    supabase.from("documents").select("document_number").eq("organisation_id", organisationId).eq("project_id", projectId).limit(10_000),
  ]);
  if (categoryError || documentError) {
    return Response.json({ error: { code: "VALIDATION_UNAVAILABLE", message: "MDR validation data is unavailable." } }, { status: 503 });
  }
  const validated = validateMdrPreview(
    parsed.data.rows,
    categories ?? [],
    (documents ?? []).map((document) => String(document.document_number)),
  );
  const controlledPayload = mdrImportPayloadSchema.safeParse({
    rows: validated.filter((row) => row.is_valid),
  });
  if (!controlledPayload.success || validated.some((row) => !row.is_valid)) {
    return Response.json({ error: { code: "ROWS_CHANGED", message: "The MDR changed after preview. Preview the workbook again before importing." } }, { status: 409 });
  }
  const rows = controlledPayload.data.rows.map(databaseRow);
  const { data, error } = await supabase.rpc("bulk_create_mdr_documents", {
    target_organisation: organisationId,
    target_project: projectId,
    import_rows: rows,
  });
  if (error) {
    const message = error.code === "23505"
      ? "A document number already exists. Refresh the preview and try again."
      : error.code === "42501"
        ? "Only the appointed Document Controller can import the MDR."
        : error.code === "PGRST202"
          ? "The MDR bulk-import database update has not been applied yet."
          : error.code === "22023"
            ? "One or more rows failed the final MDR validation."
            : "The MDR could not be imported.";
    return Response.json({ error: { code: "IMPORT_FAILED", message, reference: error.code } }, { status: 409 });
  }
  revalidatePath(`/app/${organisationId}/projects/${projectId}/documents`);
  return Response.json(data, { status: 201, headers: { "Cache-Control": "no-store" } });
}

function databaseRow(row: MdrImportRow) {
  return {
    document_number: row.document_number,
    title: row.title,
    discipline: row.discipline,
    document_type: row.document_type,
    planned_submission_date: row.planned_submission_date,
    planned_final_date: row.planned_final_date ?? null,
    required_issue_status: row.required_issue_status ?? null,
    responsible_party: row.responsible_party ?? null,
    progress_weight: row.progress_weight,
    area: row.area ?? null,
    system: row.system ?? null,
    work_package: row.work_package ?? null,
  };
}
