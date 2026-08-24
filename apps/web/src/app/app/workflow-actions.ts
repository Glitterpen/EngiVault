"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProject,requireUser } from "@/lib/auth";
import {can,canInviteProjectRole,canRemoveProjectMember} from "@/lib/permissions";
import {PROJECT_DELIVERY_STAGE_VALUES} from "@/lib/project-delivery-stage";
import {sendMdrAssignmentEmail} from "@/lib/mdr-assignment-email";
import {sendDisciplineAssignmentEmail} from "@/lib/discipline-assignment-email";
import {createAdminClient} from "@/lib/supabase/admin";

const ids=z.object({organisationId:z.uuid(),projectId:z.uuid()});
export type WorkflowState={message?:string;ok?:boolean}|undefined;
export async function setMemberDiscipline(form:FormData){const parsed=ids.extend({userId:z.uuid(),discipline:z.string().trim().min(2).max(80),enabled:z.enum(["true","false"])}).safeParse(Object.fromEntries(form));if(!parsed.success)return;const {supabase,access}=await requireProject(parsed.data.organisationId,parsed.data.projectId);if(!can(String(access.role),"engineers:manage"))return;await supabase.rpc("set_member_discipline",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,target_user:parsed.data.userId,target_discipline:parsed.data.discipline,enabled:parsed.data.enabled==="true"});revalidatePath(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/team`);revalidatePath(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/assignments`)}
export async function setDocumentAssignment(_:WorkflowState,form:FormData):Promise<WorkflowState>{
  const parsed=ids.extend({documentId:z.uuid(),userId:z.uuid(),enabled:z.enum(["true","false"])}).safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"The MDR assignment could not be identified."};
  const {supabase,access}=await requireProject(parsed.data.organisationId,parsed.data.projectId);
  if(!can(String(access.role),"document:assign"))return {message:"Only the Project Document Controller can assign MDR deliverables."};
  const enabled=parsed.data.enabled==="true";
  const {data:previousAssignment}=enabled?await supabase.from("document_assignments").select("status").eq("organisation_id",parsed.data.organisationId).eq("project_id",parsed.data.projectId).eq("document_id",parsed.data.documentId).eq("user_id",parsed.data.userId).maybeSingle():{data:null};
  const {error}=await supabase.rpc("assign_document",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,target_document:parsed.data.documentId,target_user:parsed.data.userId,enabled});
  if(error){
    if(error.code==="42501")return {message:"Only the Project Document Controller can assign MDR deliverables."};
    if(error.code==="22023")return {message:"Select an active Project Manager-appointed engineer from the same discipline."};
    return {message:`The MDR assignment could not be updated. Reference: ${error.code}.`};
  }
  const base=`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}`;
  revalidatePath(`${base}/documents/${parsed.data.documentId}`);
  revalidatePath(`${base}/assignments`);
  if(!enabled)return {message:"MDR assignment removed.",ok:true};
  if(previousAssignment?.status==="active")return {message:"This MDR deliverable is already assigned.",ok:true};

  let admin:ReturnType<typeof createAdminClient>;
  try{admin=createAdminClient()}catch{
    console.error("[mdr-assignment-email] Assignment saved but the server identity client is unavailable",{organisationId:parsed.data.organisationId,projectId:parsed.data.projectId,documentId:parsed.data.documentId});
    return {message:"MDR deliverable assigned. The in-app notification was sent, but the email could not be prepared.",ok:true};
  }
  const [{data:membership},{data:engineer},{data:organisation},{data:project},{data:document}]=await Promise.all([
    admin.from("project_memberships").select("role,status").eq("organisation_id",parsed.data.organisationId).eq("project_id",parsed.data.projectId).eq("user_id",parsed.data.userId).eq("role","engineer").eq("status","active").maybeSingle(),
    admin.from("profiles").select("display_name,email_snapshot").eq("id",parsed.data.userId).maybeSingle(),
    admin.from("organisations").select("name").eq("id",parsed.data.organisationId).eq("status","active").maybeSingle(),
    admin.from("projects").select("code,name").eq("organisation_id",parsed.data.organisationId).eq("id",parsed.data.projectId).maybeSingle(),
    admin.from("documents").select("document_number,title,discipline,planned_submission_date,required_issue_status").eq("organisation_id",parsed.data.organisationId).eq("project_id",parsed.data.projectId).eq("id",parsed.data.documentId).eq("lifecycle_status","active").maybeSingle(),
  ]);
  const vercelHost=process.env.VERCEL_PROJECT_PRODUCTION_URL??process.env.VERCEL_URL;
  const appUrl=process.env.NEXT_PUBLIC_APP_URL??(vercelHost?`https://${vercelHost}`:"http://127.0.0.1:3000");
  if(!membership||!engineer?.email_snapshot||!organisation?.name||!project?.name||!project.code||!document?.document_number){
    console.error("[mdr-assignment-email] Assignment saved but email identity is incomplete",{membership:Boolean(membership),engineer:Boolean(engineer?.email_snapshot),organisation:Boolean(organisation?.name),project:Boolean(project?.name&&project.code),document:Boolean(document?.document_number),organisationId:parsed.data.organisationId,projectId:parsed.data.projectId,documentId:parsed.data.documentId});
    return {message:"MDR deliverable assigned. The in-app notification was sent, but the email could not be prepared.",ok:true};
  }
  const delivery=await sendMdrAssignmentEmail({recipientEmail:String(engineer.email_snapshot),recipientName:engineer.display_name,organisationName:organisation.name,projectCode:project.code,projectName:project.name,documentNumber:document.document_number,documentTitle:document.title,discipline:document.discipline,plannedSubmissionDate:document.planned_submission_date,requiredIssueStatus:document.required_issue_status,documentUrl:new URL(`${base}/documents/${parsed.data.documentId}`,appUrl).toString()});
  if(!delivery.sent){
    console.error("[mdr-assignment-email] Assignment saved but email delivery failed",{reason:delivery.reason,organisationId:parsed.data.organisationId,projectId:parsed.data.projectId,documentId:parsed.data.documentId});
    return {message:"MDR deliverable assigned. The in-app notification was sent, but email delivery is temporarily unavailable.",ok:true};
  }
  return {message:"MDR deliverable assigned and the engineer was notified by email.",ok:true};
}
export async function assignDisciplineDocuments(_:WorkflowState,form:FormData):Promise<WorkflowState>{
  const parsed=ids.extend({discipline:z.string().trim().min(2).max(80),userId:z.uuid()}).safeParse(Object.fromEntries(form));
  if(!parsed.success)return {message:"Select an MDR discipline and an eligible engineer."};
  const {supabase,access}=await requireProject(parsed.data.organisationId,parsed.data.projectId);
  if(!can(String(access.role),"document:assign"))return {message:"Only the Project Document Controller can assign MDR deliverables."};
  const {data,error}=await supabase.rpc("assign_discipline_documents",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,target_discipline:parsed.data.discipline,target_user:parsed.data.userId});
  if(error){
    if(error.code==="42501")return {message:"Only the Project Document Controller can assign MDR deliverables."};
    if(error.code==="22023")return {message:"Select an active Project Manager-appointed engineer in a discipline that has active MDR deliverables."};
    if(error.code==="PGRST202")return {message:"Apply the discipline assignment database update, then try again."};
    return {message:`The discipline assignment could not be completed. Reference: ${error.code}.`};
  }
  const result=(data??{}) as {discipline?:string;total_documents?:number;new_assignments?:number};
  const assignedDiscipline=result.discipline??parsed.data.discipline;
  const totalDocuments=Number(result.total_documents??0);
  const newAssignments=Number(result.new_assignments??0);
  const base=`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}`;
  revalidatePath(`${base}/documents`);
  revalidatePath(`${base}/assignments`);
  if(newAssignments===0)return {message:`All ${totalDocuments} active ${assignedDiscipline} deliverables were already assigned to this engineer. No duplicate notification was sent.`,ok:true};

  let admin:ReturnType<typeof createAdminClient>;
  try{admin=createAdminClient()}catch{
    console.error("[discipline-assignment-email] Assignment saved but the server identity client is unavailable",{organisationId:parsed.data.organisationId,projectId:parsed.data.projectId,discipline:assignedDiscipline});
    return {message:`${newAssignments} new ${assignedDiscipline} deliverables assigned. The in-app notification was sent, but the email could not be prepared.`,ok:true};
  }
  const [{data:membership},{data:engineer},{data:organisation},{data:project}]=await Promise.all([
    admin.from("project_memberships").select("role,status").eq("organisation_id",parsed.data.organisationId).eq("project_id",parsed.data.projectId).eq("user_id",parsed.data.userId).eq("role","engineer").eq("status","active").maybeSingle(),
    admin.from("profiles").select("display_name,email_snapshot").eq("id",parsed.data.userId).maybeSingle(),
    admin.from("organisations").select("name").eq("id",parsed.data.organisationId).eq("status","active").maybeSingle(),
    admin.from("projects").select("code,name").eq("organisation_id",parsed.data.organisationId).eq("id",parsed.data.projectId).maybeSingle(),
  ]);
  const vercelHost=process.env.VERCEL_PROJECT_PRODUCTION_URL??process.env.VERCEL_URL;
  const appUrl=process.env.NEXT_PUBLIC_APP_URL??(vercelHost?`https://${vercelHost}`:"http://127.0.0.1:3000");
  if(!membership||!engineer?.email_snapshot||!organisation?.name||!project?.name||!project.code){
    console.error("[discipline-assignment-email] Assignment saved but email identity is incomplete",{membership:Boolean(membership),engineer:Boolean(engineer?.email_snapshot),organisation:Boolean(organisation?.name),project:Boolean(project?.name&&project.code),organisationId:parsed.data.organisationId,projectId:parsed.data.projectId,discipline:assignedDiscipline});
    return {message:`${newAssignments} new ${assignedDiscipline} deliverables assigned. The in-app notification was sent, but the email could not be prepared.`,ok:true};
  }
  const delivery=await sendDisciplineAssignmentEmail({recipientEmail:String(engineer.email_snapshot),recipientName:engineer.display_name,organisationName:organisation.name,projectCode:project.code,projectName:project.name,discipline:assignedDiscipline,totalDocuments,newAssignments,assignmentsUrl:new URL(`${base}/assignments`,appUrl).toString()});
  if(!delivery.sent){
    console.error("[discipline-assignment-email] Assignment saved but email delivery failed",{reason:delivery.reason,organisationId:parsed.data.organisationId,projectId:parsed.data.projectId,discipline:assignedDiscipline});
    return {message:`${newAssignments} new ${assignedDiscipline} deliverables assigned. The in-app notification was sent, but email delivery is temporarily unavailable.`,ok:true};
  }
  return {message:`${newAssignments} new ${assignedDiscipline} deliverables assigned (${totalDocuments} total). The engineer was notified by email.`,ok:true};
}
export async function setMemberRole(form:FormData){const parsed=ids.extend({userId:z.uuid(),role:z.enum(["project_admin","document_controller","engineer"])}).safeParse(Object.fromEntries(form));if(!parsed.success)return;const {supabase,access}=await requireProject(parsed.data.organisationId,parsed.data.projectId);if(!canInviteProjectRole(String(access.role),parsed.data.role))return;const {error}=await supabase.rpc("set_project_member_role",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,target_user:parsed.data.userId,target_role:parsed.data.role});if(error)return;revalidatePath(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/team`);revalidatePath(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/documents`);revalidatePath(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/assignments`)}
export async function removeProjectMember(_:WorkflowState,form:FormData):Promise<WorkflowState>{const parsed=ids.extend({userId:z.uuid(),memberRole:z.enum(["project_admin","document_controller","engineer"])}).safeParse(Object.fromEntries(form));if(!parsed.success)return {message:"The project appointment could not be identified."};const {supabase,user,access}=await requireProject(parsed.data.organisationId,parsed.data.projectId);if(user.id===parsed.data.userId)return {message:"You cannot remove your own project appointment."};if(!canRemoveProjectMember(String(access.role),parsed.data.memberRole))return {message:"You do not have permission to remove this project appointment."};const {error}=await supabase.rpc("remove_project_team_member",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,target_user:parsed.data.userId});if(error){if(error.code==="PGRST202")return {message:"Apply the project appointment removal database update, then try again."};if(error.code==="23514")return {message:"Appoint another Project Manager before removing the final active Project Manager."};if(error.code==="P0002")return {message:"This appointment is no longer active. Refresh the page."};if(error.code==="42501")return {message:"You do not have permission to remove this project appointment."};return {message:`The project appointment could not be removed. Reference: ${error.code}.`}}const base=`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}`;revalidatePath(`${base}/team`);revalidatePath(`${base}/assignments`);revalidatePath(`${base}/documents`);revalidatePath(`${base}/overview`);revalidatePath(`/app/${parsed.data.organisationId}`);return {message:"Project appointment removed. Historical records and audit evidence were retained.",ok:true}}
export async function reviewRevision(form:FormData){const parsed=ids.extend({revisionId:z.uuid(),decision:z.enum(["accepted","returned"]),comment:z.string().trim().max(1000),conformanceConfirmed:z.literal("yes").optional()}).safeParse(Object.fromEntries(form));if(!parsed.success||parsed.data.decision==="accepted"&&parsed.data.conformanceConfirmed!=="yes")return;const {supabase}=await requireProject(parsed.data.organisationId,parsed.data.projectId);await supabase.rpc("review_document_revision",{target_revision:parsed.data.revisionId,decision:parsed.data.decision,comment:parsed.data.comment});const base=`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}`;revalidatePath(`${base}/reviews`);revalidatePath(`${base}/work-packages/transmittals/new`);revalidatePath(`${base}/documents`)}
export async function markNotificationsRead(){const {supabase,user}=await requireUser();await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("recipient_user_id",user.id).is("read_at",null);revalidatePath("/app/notifications");revalidatePath("/app","layout")}
export async function markNotificationRead(notificationId:string){
 const parsed=z.uuid().safeParse(notificationId);if(!parsed.success)return {ok:false};
 const {supabase,user}=await requireUser();const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",parsed.data).eq("recipient_user_id",user.id).is("read_at",null);
 if(error)return {ok:false};revalidatePath("/app/notifications");revalidatePath(`/app/notifications/${parsed.data}`);revalidatePath("/app","layout");return {ok:true}
}
export async function deleteAllNotifications(){const {supabase,user}=await requireUser();const {error}=await supabase.from("notifications").delete().eq("recipient_user_id",user.id);if(error)redirect("/app/notifications?error=delete_all");revalidatePath("/app/notifications");revalidatePath("/app","layout")}
export async function clearNotification(form:FormData){const parsed=z.object({notificationId:z.uuid()}).safeParse(Object.fromEntries(form));if(!parsed.success)redirect("/app/notifications");const {supabase,user}=await requireUser();const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",parsed.data.notificationId).eq("recipient_user_id",user.id);if(error)redirect(`/app/notifications/${parsed.data.notificationId}?error=clear`);revalidatePath("/app/notifications");revalidatePath(`/app/notifications/${parsed.data.notificationId}`);revalidatePath("/app","layout");redirect("/app/notifications")}
export async function updateProjectBrief(_:WorkflowState,form:FormData):Promise<WorkflowState>{const optionalDate=z.preprocess(value=>value===""?null:value,z.iso.date().nullable());const parsed=ids.extend({introduction:z.string().trim().min(20).max(4000),keyObjectives:z.string().trim().min(3).max(6500),startDate:optionalDate,endDate:optionalDate,deliveryStage:z.enum(PROJECT_DELIVERY_STAGE_VALUES)}).safeParse(Object.fromEntries(form));if(!parsed.success)return {message:"Select Concept, FEED or DED, then enter the project introduction, objectives and timeline."};const objectives=parsed.data.keyObjectives.split(/\r?\n/).map(value=>value.trim().replace(/^(?:[-*•]|\d+[.)])\s*/,"")).filter(Boolean);const objectiveResult=z.array(z.string().min(3).max(500)).min(1).max(12).safeParse(objectives);if(!objectiveResult.success)return {message:"Enter between 1 and 12 objectives, one per line and no more than 500 characters each."};const {supabase,access}=await requireProject(parsed.data.organisationId,parsed.data.projectId);if(String(access.role)!=="project_admin")return {message:"Only the appointed Project Manager can update project information."};const {error}=await supabase.rpc("update_project_brief",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,new_introduction:parsed.data.introduction,new_objectives:objectiveResult.data,new_start:parsed.data.startDate,new_end:parsed.data.endDate,new_delivery_stage:parsed.data.deliveryStage});if(error)return {message:`Project brief could not be saved. Reference: ${error.code}.`};const base=`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}`;revalidatePath(`${base}/overview`);revalidatePath(`${base}/control`);revalidatePath(`${base}/assignments`);revalidatePath(`${base}/reports`);revalidatePath(`/app/${parsed.data.organisationId}`);return {message:"Project delivery stage, introduction, objectives and timeline saved.",ok:true}}
export async function upsertResourcePlan(_:WorkflowState,form:FormData):Promise<WorkflowState>{const parsed=ids.extend({discipline:z.string().trim().min(2).max(80),requiredCount:z.coerce.number().int().min(0).max(100),notes:z.string().trim().max(500)}).safeParse(Object.fromEntries(form));if(!parsed.success)return {message:"Select a discipline and enter the required number of engineers."};const {supabase,access}=await requireProject(parsed.data.organisationId,parsed.data.projectId);if(String(access.role)!=="project_admin")return {message:"Only the appointed Project Manager can plan team resources."};const {error}=await supabase.rpc("upsert_project_resource_plan",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,target_discipline:parsed.data.discipline,target_count:parsed.data.requiredCount,target_notes:parsed.data.notes});if(error)return {message:`Resource plan could not be saved. Reference: ${error.code}.`};revalidatePath(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/overview`);return {message:"Resource requirement saved.",ok:true}}
export async function createProjectIssue(_:WorkflowState,form:FormData):Promise<WorkflowState>{const optionalDate=z.preprocess(value=>value===""?null:value,z.iso.date().nullable());const parsed=ids.extend({title:z.string().trim().min(2).max(160),description:z.string().trim().max(2000),severity:z.enum(["low","medium","high","critical"]),owner:z.string().trim().max(100),dueDate:optionalDate}).safeParse(Object.fromEntries(form));if(!parsed.success)return {message:"Enter valid project issue details."};const {supabase,access}=await requireProject(parsed.data.organisationId,parsed.data.projectId);if(!can(String(access.role),"project:manage")&&!can(String(access.role),"document:write"))return {message:"You cannot report project issues."};const {error}=await supabase.rpc("create_project_issue",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,new_title:parsed.data.title,new_description:parsed.data.description,new_severity:parsed.data.severity,new_owner:parsed.data.owner,new_due_date:parsed.data.dueDate});if(error)return {message:`Project issue could not be created. Reference: ${error.code}.`};revalidatePath(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/overview`);revalidatePath(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/control`);revalidatePath(`/app/${parsed.data.organisationId}`);return {message:"Project issue reported.",ok:true}}
export async function setProjectIssueStatus(form:FormData){const parsed=ids.extend({issueId:z.uuid(),status:z.enum(["open","monitoring","resolved"])}).safeParse(Object.fromEntries(form));if(!parsed.success)return;const {supabase,access}=await requireProject(parsed.data.organisationId,parsed.data.projectId);if(!can(String(access.role),"project:manage"))return;await supabase.rpc("set_project_issue_status",{target_issue:parsed.data.issueId,new_status:parsed.data.status});revalidatePath(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/overview`);revalidatePath(`/app/${parsed.data.organisationId}`)}
