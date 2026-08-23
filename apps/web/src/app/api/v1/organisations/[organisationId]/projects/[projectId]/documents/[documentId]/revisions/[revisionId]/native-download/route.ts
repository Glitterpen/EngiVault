import { requireProject } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function GET(
  _: Request,
  ctx: { params: Promise<{ organisationId: string; projectId: string; documentId: string; revisionId: string }> },
) {
  const { organisationId, projectId, documentId, revisionId } = await ctx.params;
  const { supabase, access } = await requireProject(organisationId, projectId);
  if (!can(String(access.role), "document:download")) {
    return Response.json({ error: { code: "FORBIDDEN", message: "Document download permission is required." } }, { status: 403 });
  }
  const { data: revision } = await supabase.from("document_revisions")
    .select("id,native_storage_key")
    .eq("id", revisionId)
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (!revision?.native_storage_key) {
    return Response.json({ error: { code: "NOT_FOUND", message: "The editable native source is unavailable." } }, { status: 404 });
  }
  const { data, error: authError } = await supabase.rpc("authorize_revision_native_download", { target_revision: revisionId }).single();
  const authorised = data as { storage_key: string; original_filename: string } | null;
  if (authError || !authorised) {
    return Response.json({ error: { code: "DOWNLOAD_DENIED", message: "The editable native source could not be authorised for download." } }, { status: 403 });
  }
  const { data: signed, error: signError } = await supabase.storage.from("documents")
    .createSignedUrl(authorised.storage_key, 60, { download: authorised.original_filename });
  if (signError || !signed) {
    return Response.json({ error: { code: "DOWNLOAD_UNAVAILABLE", message: "A secure native-source download link could not be created." } }, { status: 503 });
  }
  return Response.redirect(signed.signedUrl, 302);
}
