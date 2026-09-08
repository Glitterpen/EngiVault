"use server";
import { supportReference } from "@/lib/customer-messages";


import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProject } from "@/lib/auth";
import type { DisciplineRemovalImpact } from "@/lib/project-disciplines";

export type DisciplineState = { message: string; ok?: boolean; impact?: DisciplineRemovalImpact } | undefined;
const scopeSchema = z.object({ organisationId: z.uuid(), projectId: z.uuid(), name: z.string().trim().min(1).max(80) });
const impactSchema = z.object({name:z.string(),engineerCount:z.number().int().nonnegative(),documentCount:z.number().int().nonnegative(),invitationCount:z.number().int().nonnegative(),plannedPositions:z.number().int().nonnegative()});
const schema = z.object({
  organisationId: z.uuid(), projectId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().toUpperCase().regex(/^(?:[A-Z0-9-]{1,24})?$/),
});

export async function createProjectDiscipline(_: DisciplineState, form: FormData): Promise<DisciplineState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Enter a discipline name (up to 80 characters) and an optional short code using letters, numbers or hyphens." };
  const { organisationId, projectId, name, code } = parsed.data;
  const { supabase, access, preview } = await requireProject(organisationId, projectId);
  if (preview) return { message: "Member preview is read-only." };
  if (String(access.role) !== "project_admin") return { message: "Only the appointed Project Manager can add project disciplines." };
  const { data, error } = await supabase.rpc("create_project_discipline", {
    target_organisation: organisationId, target_project: projectId, new_name: name, new_code: code || null,
  });
  if (error) return { message: error.code === "23505" ? "That short code is already used by another discipline. Choose a different code."
    : error.code === "42501" ? "Only the appointed Project Manager can add project disciplines."
    : error.code === "PGRST202" ? "Adding a project discipline is temporarily unavailable. Please contact EngiCite support."
    : `The discipline could not be added. Reference: ${supportReference(error.code)}.` };
  refresh(organisationId, projectId);
  return { ok: true, message: `${String(data)} is available for this project's MDR, invitations and resource plan.` };
}

function refresh(org:string,project:string){revalidatePath(`/app/${org}/projects/${project}`,"layout");}
function removalError(code:string):DisciplineState{
  if(code==="42501")return {message:"Only the appointed Project Manager can manage project disciplines."};
  if(code==="22023")return {message:"Review the removal confirmation. This discipline may already have been removed or restored."};
  return {message:`The discipline could not be updated. Please retry. Reference: ${supportReference(code)}.`};
}

export async function inspectProjectDisciplineRemoval(form:FormData):Promise<DisciplineState>{
  const parsed=scopeSchema.safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Invalid project discipline."};
  const {organisationId,projectId,name}=parsed.data;
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  if(preview)return {message:"Member preview is read-only."};
  if(String(access.role)!=="project_admin")return removalError("42501");
  const {data,error}=await supabase.rpc("get_project_discipline_removal_impact",{target_organisation:organisationId,target_project:projectId,target_discipline:name});
  if(error)return removalError(error.code);
  const impact=impactSchema.safeParse(data);
  return impact.success?{message:"",impact:impact.data}:{message:"The assignment warning could not be loaded. Close this window and retry."};
}

export async function removeProjectDiscipline(_:DisciplineState,form:FormData):Promise<DisciplineState>{
  const parsed=scopeSchema.extend({confirmed:z.literal("true"),expectedEngineerCount:z.coerce.number().int().nonnegative(),confirmedAssigned:z.enum(["true","false"]).optional()}).safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Confirm that you want to remove this discipline from new selections."};
  const {organisationId,projectId,name,expectedEngineerCount,confirmedAssigned}=parsed.data;
  if(expectedEngineerCount>0&&confirmedAssigned!=="true")return {message:"Acknowledge the assigned-engineer warning before removing this discipline."};
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  if(preview)return {message:"Member preview is read-only."};
  if(String(access.role)!=="project_admin")return removalError("42501");
  const {error}=await supabase.rpc("remove_project_discipline",{target_organisation:organisationId,target_project:projectId,target_discipline:name,confirmed:true,expected_engineer_count:expectedEngineerCount,confirmed_assigned:confirmedAssigned==="true"});
  if(error?.code==="40001"){
    const latest=await inspectProjectDisciplineRemoval(form);
    return {...latest,message:latest?.impact?"The assigned engineers changed. Review the updated warning and confirm again.":latest?.message||"Refresh the page and review the assignment warning again."};
  }
  if(error)return removalError(error.code);
  refresh(organisationId,projectId);
  return {ok:true,message:`${name} removed from new selections. Existing engineer access and deliverables are unchanged.`};
}

export async function restoreProjectDiscipline(_:DisciplineState,form:FormData):Promise<DisciplineState>{
  const parsed=scopeSchema.safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Invalid project discipline."};
  const {organisationId,projectId,name}=parsed.data;
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  if(preview)return {message:"Member preview is read-only."};
  if(String(access.role)!=="project_admin")return removalError("42501");
  const {error}=await supabase.rpc("restore_project_discipline",{target_organisation:organisationId,target_project:projectId,target_discipline:name});
  if(error)return removalError(error.code);
  refresh(organisationId,projectId);
  return {ok:true,message:`${name} restored to this project's selections.`};
}
