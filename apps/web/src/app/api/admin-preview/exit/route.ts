import {NextResponse} from "next/server";
import {requireAuthenticatedUser} from "@/lib/auth";
import {cookies} from "next/headers";
import {ADMIN_PREVIEW_COOKIE,parseAdminPreview,writeAdminPreview} from "@/lib/admin-preview";

export async function POST(request:Request){
  const preview=parseAdminPreview((await cookies()).get(ADMIN_PREVIEW_COOKIE)?.value);
  if(preview){
    const {supabase}=await requireAuthenticatedUser();
    await supabase.rpc("end_project_member_preview",{target_preview:preview.sessionId});
    await writeAdminPreview(null);
    return NextResponse.redirect(new URL(`/app/${preview.organisationId}/projects/${preview.projectId}/overview`,request.url),303);
  }
  await writeAdminPreview(null);
  return NextResponse.redirect(new URL("/app",request.url),303);
}
