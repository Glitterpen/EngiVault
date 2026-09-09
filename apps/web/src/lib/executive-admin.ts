import "server-only";
import {notFound} from "next/navigation";
import {requireUser} from "./auth";
import {readAdminPreview} from "./admin-preview";
import {z} from "zod";

export async function requireExecutiveAdministrator(organisationId:string){
  const session=await requireUser();
  if(await readAdminPreview())notFound();
  const {data,error}=await session.supabase.rpc("get_my_organisations").eq("organisation_id",organisationId).maybeSingle();
  const access=z.object({organisation_id:z.uuid(),name:z.string(),role:z.literal("organisation_admin")}).safeParse(data);
  if(error||!access.success)notFound();
  return {...session,organisation:access.data};
}
export const executiveDirectorySchema=z.object({total:z.number().int().nonnegative(),entries:z.array(z.object({
  id:z.uuid(),kind:z.enum(["member","invitation"]),display_name:z.string(),email:z.string(),
  status:z.enum(["active","revoked","pending","expired"]),created_at:z.string(),expires_at:z.string().nullable(),
}))});
