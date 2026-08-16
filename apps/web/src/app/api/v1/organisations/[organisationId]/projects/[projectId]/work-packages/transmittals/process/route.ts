import { requireProject } from "@/lib/auth";
import { processNextDocumentRevision } from "@/lib/processor";

export async function POST(
  _request: Request,
  context: { params: Promise<{ organisationId: string; projectId: string }> },
) {
  const { organisationId, projectId } = await context.params;
  const { access } = await requireProject(organisationId, projectId);
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
