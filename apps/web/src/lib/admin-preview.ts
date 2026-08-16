import "server-only";
import {cookies} from "next/headers";
import {canPreviewProjectRole,type AdministratorPreviewRole} from "@/lib/permissions";

export const ADMIN_PREVIEW_COOKIE="engicite_admin_preview";

export type AdminPreview={organisationId:string;projectId:string;role:AdministratorPreviewRole};

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAdminPreview(value:string|undefined):AdminPreview|null{
  if(!value)return null;
  const [organisationId,projectId,role]=value.split(":");
  const candidateRole=role??"";
  if(!uuid.test(organisationId??"")||!uuid.test(projectId??"")||!canPreviewProjectRole("organisation_admin",candidateRole))return null;
  return {organisationId,projectId,role:candidateRole};
}

export async function readAdminPreview():Promise<AdminPreview|null>{
  return parseAdminPreview((await cookies()).get(ADMIN_PREVIEW_COOKIE)?.value);
}

export async function writeAdminPreview(preview:AdminPreview|null):Promise<void>{
  const store=await cookies();
  if(!preview){store.delete(ADMIN_PREVIEW_COOKIE);return}
  store.set(ADMIN_PREVIEW_COOKIE,`${preview.organisationId}:${preview.projectId}:${preview.role}`,{
    httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60,
  });
}
