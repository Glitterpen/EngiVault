"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireUser} from "@/lib/auth";
import {readAdminPreview} from "@/lib/admin-preview";
import {EMAIL_EVENTS} from "@/lib/notification-preferences";

export async function saveNotificationPreferences(_: {ok?:boolean;message?:string}, form:FormData):Promise<{ok?:boolean;message?:string}> {
  if(await readAdminPreview())return {message:"Member preview is read-only. Exit preview to change your own preferences."};
  const parsed=z.object({organisationId:z.uuid(),projectId:z.uuid().nullable(),enabled:z.boolean(),disciplines:z.array(z.string().trim().min(1).max(80)).max(300).nullable(),events:z.array(z.enum(Object.keys(EMAIL_EVENTS) as [keyof typeof EMAIL_EVENTS,...(keyof typeof EMAIL_EVENTS)[]])).max(9).nullable()}).safeParse({
    organisationId:form.get("organisationId"),projectId:form.get("projectId")||null,enabled:form.get("emailEnabled")==="on",
    disciplines:form.get("allDisciplines")==="on"?null:form.getAll("disciplines"),events:form.get("allEvents")==="on"?null:form.getAll("events"),
  });
  if(!parsed.success)return {message:"Check your notification selections and try again."};
  const {supabase}=await requireUser();
  const p=parsed.data;
  const {error}=await supabase.rpc("set_my_notification_email_preferences",{target_organisation:p.organisationId,target_project:p.projectId,enabled:p.enabled,selected_disciplines:p.disciplines,selected_events:p.events});
  if(error)return {message:"Email preferences could not be saved. Only authorised administrators and project managers can change their own preferences."};
  revalidatePath(`/app/${p.organisationId}/settings/notifications`);
  return {ok:true,message:"Email preferences saved. All in-app notifications remain enabled."};
}
