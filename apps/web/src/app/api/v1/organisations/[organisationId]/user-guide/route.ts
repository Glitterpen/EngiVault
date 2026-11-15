import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { readAdminPreview } from "@/lib/admin-preview";
import { requireProject, requireUser } from "@/lib/auth";

export const runtime = "nodejs";

const scope = z.object({ organisationId: z.uuid(), projectId: z.uuid().nullable() });
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function unavailable(status: number, message: string) {
  return Response.json({ error: { message } }, { status, headers });
}

function projectGuide(actualRole: string) {
  switch (actualRole) {
    case "project_admin": return "project-manager";
    case "document_controller": return "document-controller";
    case "engineer": return "discipline-engineer";
    default: return null;
  }
}

export async function GET(request: Request, context: { params: Promise<{ organisationId: string }> }) {
  const { organisationId } = await context.params;
  const query = new URL(request.url).searchParams;
  const parsedScope = scope.safeParse({ organisationId, projectId: query.get("project") });
  if (!parsedScope.success || query.getAll("format").some((format) => format !== "pdf")) {
    return unavailable(400, "Invalid guide request.");
  }

  const { projectId } = parsedScope.data;
  let guide;

  if (projectId) {
    const { actualRole, preview } = await requireProject(organisationId, projectId);
    guide = preview ? null : projectGuide(actualRole);
  } else {
    const { supabase } = await requireUser();
    if (await readAdminPreview()) return unavailable(403, "This guide is not available in role preview.");
    const { data, error } = await supabase.rpc("get_my_organisations")
      .eq("organisation_id", organisationId).maybeSingle();
    guide = !error && data && typeof data === "object" && "role" in data && data.role === "organisation_admin"
      ? "organisation-administrator" : null;
  }

  if (!guide) return unavailable(403, "A user guide is not available for this role.");

  try {
    const bytes = await readFile(join(process.cwd(), "assets", "user-guides", `${guide}.pdf`));
    return new Response(Uint8Array.from(bytes), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="EngiCite-${guide}-user-guide.pdf"`,
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch {
    return unavailable(503, "The user guide is temporarily unavailable. Please try again shortly.");
  }
}
