import Link from "next/link";
import {z} from "zod";
import {notFound} from "next/navigation";
import {requireUser} from "@/lib/auth";
import {readAdminPreview} from "@/lib/admin-preview";
import {NotificationPreferencesForm} from "@/components/notification-preferences-form";
import type {NotificationPreferences} from "@/lib/notification-preferences";

export default async function NotificationSettings({params,searchParams}:{params:Promise<{organisationId:string}>;searchParams:Promise<{projectId?:string}>}) {
 const {organisationId}=await params; const {projectId:queryProject}=await searchParams;
 if(!z.uuid().safeParse(organisationId).success||(queryProject&&!z.uuid().safeParse(queryProject).success))notFound();
 const projectId=queryProject??null;
 const {supabase}=await requireUser();
 if(await readAdminPreview())return <p>Exit member preview to manage your own email preferences.</p>;
 const {data,error}=await supabase.rpc("get_my_notification_email_preferences",{target_organisation:organisationId,target_project:projectId});
 if(error||!data)return <div className="ev-card p-6">Email preferences are unavailable. This setting is for Organisation Administrators and Project Managers. Please retry after the settings update is available.</div>;
 return <div className="mx-auto max-w-3xl"><Link className="text-sm font-semibold" href={projectId?`/app/${organisationId}/projects/${projectId}/settings`:`/app/${organisationId}/settings`}>Back to settings</Link><h1 className="mt-5 text-3xl font-semibold">My email notifications</h1><p className="mt-2 text-sm">{projectId?"Preferences for this project":"Preferences across this organisation"}</p><NotificationPreferencesForm organisationId={organisationId} projectId={projectId} preferences={data as NotificationPreferences}/></div>;
}
