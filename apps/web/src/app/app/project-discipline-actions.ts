"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProject } from "@/lib/auth";

export type DisciplineState = { message: string; ok?: boolean } | undefined;
const schema = z.object({
  organisationId: z.uuid(), projectId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().toUpperCase().regex(/^(?:[A-Z0-9-]{1,24})?$/),
});

export async function createProjectDiscipline(_: DisciplineState, form: FormData): Promise<DisciplineState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Enter a discipline name (up to 80 characters) and an optional short code using letters, numbers or hyphens." };
  const { organisationId, projectId, name, code } = parsed.data;
  const { supabase, access } = await requireProject(organisationId, projectId);
  if (String(access.role) !== "project_admin") return { message: "Only the appointed Project Manager can add project disciplines." };
  const { data, error } = await supabase.rpc("create_project_discipline", {
    target_organisation: organisationId, target_project: projectId, new_name: name, new_code: code || null,
  });
  if (error) return { message: error.code === "23505" ? "That short code is already used by another discipline. Choose a different code."
    : error.code === "42501" ? "Only the appointed Project Manager can add project disciplines."
    : error.code === "PGRST202" ? "The project-discipline database update has not been applied yet."
    : `The discipline could not be added. Reference: ${error.code}.` };
  const base = `/app/${organisationId}/projects/${projectId}`;
  revalidatePath(`${base}/team`);
  revalidatePath(`${base}/documents`);
  return { ok: true, message: `${String(data)} is available for this project's MDR, invitations and resource plan.` };
}
