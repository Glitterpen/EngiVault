"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireProject} from "@/lib/auth";
import {serviceFailureMessage} from "@/lib/customer-messages";
import {plannedMilestonesSchema} from "@/lib/project-milestone-baseline";

export type MilestoneBaselineState={ok?:boolean;message?:string};

export async function approveMilestoneBaseline(_:MilestoneBaselineState,form:FormData):Promise<MilestoneBaselineState>{
  const parsed=z.object({
    organisationId:z.uuid(),projectId:z.uuid(),expectedBaseline:z.union([z.uuid(),z.literal("")]),
    expectedScopeHash:z.string().min(1).max(128),approvalReason:z.string().trim().min(10).max(1000),
    confirmApproval:z.literal("on"),plannedMilestones:z.string().min(2).max(600000),
  }).safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Review every milestone date, enter an approval reason and confirm the baseline approval."};
  let milestones:unknown;
  try{milestones=JSON.parse(parsed.data.plannedMilestones);}catch{return {message:"The milestone plan could not be read. Reload this page and try again."};}
  const plan=plannedMilestonesSchema.safeParse(milestones);
  if(!plan.success)return {message:"Review all deliverables: every milestone needs a valid date in issue order, with no duplicates."};
  const {organisationId,projectId,expectedBaseline,expectedScopeHash,approvalReason}=parsed.data;
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  if(preview||String(access.role)!=="project_admin")return {message:"Only the appointed Project Manager can approve a baseline. Member preview is read-only."};
  try{
    const {error}=await supabase.rpc("approve_project_milestone_baseline",{
      target_organisation:organisationId,target_project:projectId,expected_baseline:expectedBaseline||null,
      expected_scope_hash:expectedScopeHash,planned_milestones:plan.data,approval_reason:approvalReason,
    });
    if(error){
      if(error.code==="54000")return {message:"Baseline approval currently supports up to 1,000 active deliverables. No partial plan was approved. Contact support for the complete project scope."};
      if(error.code==="40001"||error.code==="23505")return {message:"The project scope or approved baseline changed. Reload the plan, review the latest deliverables and approve again."};
      if(error.code==="22023"||error.code==="23514")return {message:"The plan is incomplete or no longer matches the current project timeline. Reload and review all milestone dates."};
      return {message:serviceFailureMessage("The baseline could not be approved. Your previous approved plan is unchanged.",error)};
    }
  }catch{return {message:serviceFailureMessage("The baseline approval could not be confirmed. Reload the plan before trying again.",null)};}
  revalidatePath(`/app/${organisationId}/projects/${projectId}`,"layout");
  revalidatePath(`/app/${organisationId}`);
  return {ok:true,message:"Milestone baseline approved. Future planned-progress views now use this version; existing reports and actual progress are unchanged."};
}
