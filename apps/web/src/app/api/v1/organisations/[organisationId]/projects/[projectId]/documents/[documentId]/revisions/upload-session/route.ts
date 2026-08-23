import { z } from "zod";
import { requireProject } from "@/lib/auth";
import {
  expectedMime,
  hasExpectedMime,
  isNativeEngineeringFile,
  MAX_UPLOAD_BYTES,
} from "@/lib/file-validation";
import { DOCUMENT_ISSUE_STATUS_VALUES } from "@/lib/document-issue-status";
import { requiresNativeCompanion } from "@/lib/native-file-requirement";
import type { ProjectDeliveryStage } from "@/lib/project-delivery-stage";
import { rateLimited } from "@/lib/rate-limit";

const fileMetadata = z.object({
  fileName: z.string().min(1).max(180),
  mimeType: z.string(),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const schema = fileMetadata.extend({
  revisionCode: z.string().trim().toUpperCase().min(1).max(20),
  issueStatus: z.enum(DOCUMENT_ISSUE_STATUS_VALUES),
  issueDate: z.iso.date().optional(),
  nativeFile: fileMetadata.optional(),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ organisationId: string; projectId: string; documentId: string }> },
) {
  const { organisationId, projectId, documentId } = await ctx.params;
  const { supabase, access } = await requireProject(organisationId, projectId);
  if (String(access.role) !== "engineer") {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "Only an authorised discipline engineer may upload MDR revisions." } },
      { status: 403 },
    );
  }
  const { data: disciplineAccess, error: accessError } = await supabase.rpc("can_upload_document", {
    org: organisationId,
    project: projectId,
    document: documentId,
  });
  if (accessError || !disciplineAccess) {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "You can upload only to MDR documents in your authorised engineering discipline." } },
      { status: 403 },
    );
  }
  if (await rateLimited(supabase, organisationId, "upload-session", 30, 3600)) {
    return Response.json(
      { error: { code: "RATE_LIMITED", message: "Upload session limit reached. Try again later." } },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "Upload metadata is invalid.", fieldErrors: body.error.flatten().fieldErrors } },
      { status: 422 },
    );
  }
  if (!expectedMime(body.data.fileName) || !hasExpectedMime(body.data.fileName, body.data.mimeType)) {
    return Response.json(
      { error: { code: "UNSUPPORTED_FILE", message: "Only PDF, DOCX, XLSX and DWG files with matching MIME types are accepted." } },
      { status: 415 },
    );
  }
  if (body.data.nativeFile && (
    !isNativeEngineeringFile(body.data.nativeFile.fileName)
    || !hasExpectedMime(body.data.nativeFile.fileName, body.data.nativeFile.mimeType)
  )) {
    return Response.json(
      { error: { code: "UNSUPPORTED_NATIVE_FILE", message: "The editable native source must be a DWG, DOCX or XLSX file with a matching file type." } },
      { status: 415 },
    );
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("delivery_stage")
    .eq("organisation_id", organisationId)
    .eq("id", projectId)
    .maybeSingle();
  if (projectError || !project) {
    return Response.json(
      { error: { code: "PROJECT_UNAVAILABLE", message: "The project delivery stage could not be verified." } },
      { status: 409 },
    );
  }
  const deliveryStage = project.delivery_stage as ProjectDeliveryStage;
  if (requiresNativeCompanion(deliveryStage, body.data.issueStatus, body.data.fileName) && !body.data.nativeFile) {
    return Response.json(
      {
        error: {
          code: "NATIVE_SOURCE_REQUIRED",
          message: "Attach the editable DWG, DOCX or XLSX source before submitting the final FEED or construction issue PDF.",
        },
      },
      { status: 422 },
    );
  }

  const revisionId = crypto.randomUUID();
  const safeName = safeStorageName(body.data.fileName);
  const storageKey = `organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${revisionId}/${safeName}`;
  const nativeSafeName = body.data.nativeFile ? safeStorageName(body.data.nativeFile.fileName) : null;
  const nativeStorageKey = nativeSafeName
    ? `organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${revisionId}/native/${nativeSafeName}`
    : null;

  const { error } = await supabase.from("document_revisions").insert({
    id: revisionId,
    organisation_id: organisationId,
    project_id: projectId,
    document_id: documentId,
    revision_code: body.data.revisionCode,
    issue_status: body.data.issueStatus,
    issue_date: body.data.issueDate || null,
    original_filename: safeName,
    declared_mime: body.data.mimeType,
    byte_size: body.data.size,
    sha256: body.data.sha256,
    storage_key: storageKey,
    native_original_filename: nativeSafeName,
    native_declared_mime: body.data.nativeFile?.mimeType ?? null,
    native_byte_size: body.data.nativeFile?.size ?? null,
    native_sha256: body.data.nativeFile?.sha256 ?? null,
    native_storage_key: nativeStorageKey,
    control_status: "submitted",
  });
  if (error) {
    const message = error.code === "23505"
      ? "This revision code already exists for the document."
      : error.code === "23514"
        ? "The final FEED or construction issue PDF requires its editable native source."
        : `The revision could not be registered. Reference: ${error.code}.`;
    return Response.json(
      { error: { code: "REVISION_REGISTRATION_FAILED", message } },
      { status: error.code === "23505" ? 409 : error.code === "23514" ? 422 : 500 },
    );
  }

  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const { error: sessionError } = await supabase.from("upload_sessions").insert({
    organisation_id: organisationId,
    project_id: projectId,
    revision_id: revisionId,
    storage_key: storageKey,
    expected_size: body.data.size,
    expected_sha256: body.data.sha256,
    native_storage_key: nativeStorageKey,
    expected_native_size: body.data.nativeFile?.size ?? null,
    expected_native_sha256: body.data.nativeFile?.sha256 ?? null,
    expires_at: expiresAt,
  });
  if (sessionError) {
    return Response.json(
      { error: { code: "SESSION_ERROR", message: `The secure upload session could not be recorded. Reference: ${sessionError.code}.` } },
      { status: 503 },
    );
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("documents")
    .createSignedUploadUrl(storageKey, { upsert: false });
  if (signError) {
    return Response.json(
      { error: { code: "STORAGE_ERROR", message: `A secure storage link could not be created. Reference: ${signError.name}.` } },
      { status: 503 },
    );
  }

  let nativeSigned: { path: string; token: string } | undefined;
  if (nativeStorageKey) {
    const { data, error: nativeSignError } = await supabase.storage
      .from("documents")
      .createSignedUploadUrl(nativeStorageKey, { upsert: false });
    if (nativeSignError) {
      return Response.json(
        { error: { code: "STORAGE_ERROR", message: `The native-source storage link could not be created. Reference: ${nativeSignError.name}.` } },
        { status: 503 },
      );
    }
    nativeSigned = { path: data.path, token: data.token };
  }

  return Response.json(
    {
      revisionId,
      path: signed.path,
      token: signed.token,
      native: nativeSigned,
      expiresIn: 7200,
    },
    { status: 201 },
  );
}

function safeStorageName(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}
