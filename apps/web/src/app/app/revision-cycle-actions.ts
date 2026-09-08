"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireProject} from "@/lib/auth";
import {supportReference} from "@/lib/customer-messages";

export type RevisionCycleState={ok?:boolean;message?:string};
export async function updateRevisionCycle(_:RevisionCycleState,form:FormData):Promise<RevisionCycleState>{
  const parsed=z.object({organisationId:z.uuid(),projectId:z.uuid(),workingDays:z.coerce.number().int().min(1).max(365)}).safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Enter a revision cycle from 1 to 365 working days."};
  const {organisationId,projectId,workingDays}=parsed.data;
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  if(preview||String(access.role)!=="project_admin")return {message:"Only the appointed Project Manager can change the revision cycle. Member preview is read-only."};
  const {error}=await supabase.rpc("set_project_revision_cycle",{target_organisation:organisationId,target_project:projectId,working_days:workingDays});
  if(error)return {message:`Revision cycle could not be saved. Reference: ${supportReference(error.code)}.`};
  revalidatePath(`/app/${organisationId}/projects/${projectId}`,"layout");
  revalidatePath(`/app/${organisationId}`);
  return {ok:true,message:`Revision cycle saved: ${workingDays} working days. MDR next-revision deadlines are now recalculated from the previous issue date.`};
}
