import { requireProject } from "@/lib/auth";
import { processNextDocumentRevision } from "@/lib/processor";

export async function POST(
  _request: Request,
  context: { params: Promise<{ organisationId: string; projectId: string }> },
) {
  const { organisationId, projectId } = await context.params;
  const { access, preview } = await requireProject(organisationId, projectId);
  if (preview) {
    return Response.json(
      { error: { code: "ADMIN_PREVIEW_READ_ONLY", message: "Exit administrator role preview before changing project data." } },
      { status: 423, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (String(access.role) !== "document_controller") {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "Only the Document Controller can prepare transmittal files." } },
      { status: 403 },
    );
  }

  try {
    const state = await processNextDocumentRevision();
    return Response.json({ state }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: { code: "PROCESSOR_UNAVAILABLE", message: "Secure document preparation is temporarily unavailable." } },
      { status: 503 },
    );
  }
}
