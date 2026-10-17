"use server";
import { supportReference } from "@/lib/customer-messages";


import {revalidatePath} from "next/cache";
import {z} from "zod";
import {requireProject} from "@/lib/auth";
import {can} from "@/lib/permissions";
import {reportDateInTimezone} from "@/lib/project-report";
import {pdfColorTemplateField} from "@/lib/pdf-color-template";

const ids=z.object({organisationId:z.uuid(),projectId:z.uuid()});
export type ProjectReportActionState={ok?:boolean;message?:string;reportId?:string}|undefined;

export async function saveProjectReportSchedule(_:ProjectReportActionState,form:FormData):Promise<ProjectReportActionState>{
  const parsed=ids.extend({weekday:z.coerce.number().int().min(0).max(6),enabled:z.preprocess(value=>value==="on",z.boolean()),pdfColorTemplate:pdfColorTemplateField}).safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Choose a valid weekly report day."};
  const {supabase,access,preview}=await requireProject(parsed.data.organisationId,parsed.data.projectId);
  if(preview)return {message:"Member preview is read-only. Report settings cannot be changed."};
  if(!can(String(access.role),"project:manage"))return {message:"Project management permission is required."};
  const {error}=await supabase.rpc("set_project_report_schedule_with_pdf_template",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,new_weekday:parsed.data.weekday,new_enabled:parsed.data.enabled,new_pdf_color_template:parsed.data.pdfColorTemplate});
  if(error)return {message:error.code==="PGRST202"?"Report settings are temporarily unavailable. Please contact EngiCite support.":`The report schedule could not be saved. Reference: ${supportReference(error.code)}.`};
  revalidatePath(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/reports`);
  return {ok:true,message:parsed.data.enabled?"Weekly report generation is active.":"Automatic weekly report generation is paused."};
}

export async function generateProjectReport(_:ProjectReportActionState,form:FormData):Promise<ProjectReportActionState>{
  const parsed=ids.extend({pdfColorTemplate:pdfColorTemplateField}).safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"The project report request is invalid."};
  const {supabase,access,preview}=await requireProject(parsed.data.organisationId,parsed.data.projectId);
  if(preview)return {message:"Member preview is read-only. Reports cannot be generated."};
  if(!can(String(access.role),"project:manage"))return {message:"Project management permission is required."};
  const today=reportDateInTimezone();
  const {data,error}=await supabase.rpc("generate_project_weekly_report_with_pdf_template",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,target_period_end:today,new_pdf_color_template:parsed.data.pdfColorTemplate});
  if(error||typeof data!=="string")return {message:`The project report could not be generated. Reference: ${supportReference(error?.code??"report_0")}.`};
  const base=`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}`;
  revalidatePath(`${base}/reports`);
  revalidatePath(`${base}/reports/${data}`);
  return {ok:true,message:"Project report generated.",reportId:data};
}
