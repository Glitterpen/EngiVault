import "server-only";
import {cookies} from "next/headers";
import {cache} from "react";
import {createClient} from "@/lib/supabase/server";
import type {AdministratorPreviewRole} from "@/lib/permissions";

export const ADMIN_PREVIEW_COOKIE="engicite_admin_preview";

export type AdminPreview={sessionId:string;organisationId:string;projectId:string;memberId:string;role:AdministratorPreviewRole;displayName:string;email:string;disciplines:string[];expiresAt:string};
export type PreviewReference=Pick<AdminPreview,'organisationId'|'projectId'|'sessionId'>;

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAdminPreview(value:string|undefined):PreviewReference|null{
  if(!value)return null;
  const [organisationId,projectId,sessionId,...extra]=value.split(":");
  if(extra.length||!uuid.test(organisationId??"")||!uuid.test(projectId??"")||!uuid.test(sessionId??""))return null;
  return {organisationId,projectId,sessionId};
}

export const readAdminPreview=cache(async():Promise<AdminPreview|null>=>{
  const value=(await cookies()).get(ADMIN_PREVIEW_COOKIE)?.value;
  if(!value)return null;
  const reference=parseAdminPreview(value);
  if(!reference)throw new Error('This role preview is no longer valid. Exit preview and select a team member.');
  const supabase=await createClient();
  const {data,error}=await supabase.rpc('get_project_member_preview',{target_preview:reference.sessionId});
  if(error||!data||data.organisationId!==reference.organisationId||data.projectId!==reference.projectId)throw new Error('Member preview expired or access changed. Exit preview and select an active team member.');
  return data as AdminPreview;
});

export async function writeAdminPreview(preview:PreviewReference|null):Promise<void>{
  const store=await cookies();
  if(!preview){store.delete(ADMIN_PREVIEW_COOKIE);return}
  store.set(ADMIN_PREVIEW_COOKIE,`${preview.organisationId}:${preview.projectId}:${preview.sessionId}`,{
    httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60,
  });
}
