import "server-only";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
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
  // An expired/ended preview is an expected access state, including when a
  // parallel page render finishes after Exit preview. Never fall back to the
  // administrator's client or throw a generic Server Components error.
  if(!reference)redirect('/admin-preview-unavailable');
  const supabase=await createClient();
  let result;
  try{
    result=await supabase.rpc('get_project_member_preview',{target_preview:reference.sessionId});
  }catch{
    // Service failures also fail closed; the exit screen does not read data.
    result=null;
  }
  // Keep framework redirect control flow outside the service error handler.
  if(!result||result.error||!result.data||result.data.organisationId!==reference.organisationId||result.data.projectId!==reference.projectId)redirect('/admin-preview-unavailable');
  const {data}=result;
  return data as AdminPreview;
});

export async function writeAdminPreview(preview:PreviewReference|null):Promise<void>{
  const store=await cookies();
  if(!preview){store.delete(ADMIN_PREVIEW_COOKIE);return}
  store.set(ADMIN_PREVIEW_COOKIE,`${preview.organisationId}:${preview.projectId}:${preview.sessionId}`,{
    httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60,
  });
}
