import Link from "next/link";
import {z} from "zod";
import {notFound} from "next/navigation";
import {requireUser} from "@/lib/auth";
import {readAdminPreview} from "@/lib/admin-preview";
import {NotificationPreferencesForm} from "@/components/notification-preferences-form";
import type {NotificationPreferences} from "@/lib/notification-preferences";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import {HelpTip} from "@/components/help-tip";
import {ArrowLeft} from "lucide-react";

export default async function NotificationSettings({params,searchParams}:{params:Promise<{organisationId:string}>;searchParams:Promise<{projectId?:string}>}) {
 const {organisationId}=await params; const {projectId:queryProject}=await searchParams;
 if(!z.uuid().safeParse(organisationId).success||(queryProject&&!z.uuid().safeParse(queryProject).success))notFound();
 const projectId=queryProject??null;
 const {supabase}=await requireUser();
 if(await readAdminPreview())return <div className="ev-card mx-auto max-w-3xl p-5 text-sm leading-6 text-[#526675]">Exit member preview to manage your own email preferences.</div>;
 const {data,error}=await supabase.rpc("get_my_notification_email_preferences",{target_organisation:organisationId,target_project:projectId});
 if(error||!data)return <div role="alert" className="ev-card mx-auto max-w-3xl p-5 text-sm leading-6 text-[#526675]">Email preferences are unavailable. This setting is for Organisation Administrators and Project Managers. Please retry after the settings update is available.</div>;
 return <div className="mx-auto min-w-0 max-w-3xl"><Link className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#10243e]" href={projectId?`/app/${organisationId}/projects/${projectId}/settings`:`/app/${organisationId}/settings`}><ArrowLeft aria-hidden="true" size={16}/>Back to settings</Link><WorkspacePageHeading title="My email notifications" context={projectId?"Preferences for this project":"Preferences across this organisation"} help={<HelpTip label="Notification delivery preferences">These preferences only change event emails sent to you. All in-app notifications stay enabled. Authentication and password-recovery emails are unaffected.</HelpTip>}/><NotificationPreferencesForm organisationId={organisationId} projectId={projectId} preferences={data as NotificationPreferences}/></div>;
}
