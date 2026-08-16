"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireProject} from "@/lib/auth";
import {can} from "@/lib/permissions";
import {reportDateInTimezone} from "@/lib/project-report";

const ids=z.object({organisationId:z.uuid(),projectId:z.uuid()});
export type ProjectReportActionState={ok?:boolean;message?:string;reportId?:string}|undefined;

export async function saveProjectReportSchedule(_:ProjectReportActionState,form:FormData):Promise<ProjectReportActionState>{
  const parsed=ids.extend({weekday:z.coerce.number().int().min(0).max(6),enabled:z.preprocess(value=>value==="on",z.boolean())}).safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Choose a valid weekly report day."};
  const {supabase,access}=await requireProject(parsed.data.organisationId,parsed.data.projectId);
  if(!can(String(access.role),"project:manage"))return {message:"Project management permission is required."};
  const {error}=await supabase.rpc("set_project_report_schedule",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,new_weekday:parsed.data.weekday,new_enabled:parsed.data.enabled});
  if(error)return {message:error.code==="PGRST202"?"Apply the configurable report-columns database update, then save again.":`The report schedule could not be saved. Reference: ${error.code}.`};
  revalidatePath(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/reports`);
  return {ok:true,message:parsed.data.enabled?"Weekly report generation is active.":"Automatic weekly report generation is paused."};
}

export async function generateProjectReport(_:ProjectReportActionState,form:FormData):Promise<ProjectReportActionState>{
  const parsed=ids.safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"The project report request is invalid."};
  const {supabase,access}=await requireProject(parsed.data.organisationId,parsed.data.projectId);
  if(!can(String(access.role),"project:manage"))return {message:"Project management permission is required."};
  const today=reportDateInTimezone();
  const {data,error}=await supabase.rpc("generate_project_weekly_report",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,target_period_end:today});
  if(error||typeof data!=="string")return {message:`The project report could not be generated. Reference: ${error?.code??"report_0"}.`};
  const base=`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}`;
  revalidatePath(`${base}/reports`);
  revalidatePath(`${base}/reports/${data}`);
  return {ok:true,message:"Project report generated.",reportId:data};
}
