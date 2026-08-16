import {NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {readAdminPreview,writeAdminPreview} from "@/lib/admin-preview";

export async function POST(request:Request){
  const preview=await readAdminPreview();
  if(preview){
    const {supabase}=await requireUser();
    await supabase.rpc("record_project_role_preview",{target_organisation:preview.organisationId,target_project:preview.projectId,preview_role:preview.role,preview_event:"exited"});
    await writeAdminPreview(null);
    return NextResponse.redirect(new URL(`/app/${preview.organisationId}/projects/${preview.projectId}/overview`,request.url),303);
  }
  await writeAdminPreview(null);
  return NextResponse.redirect(new URL("/app",request.url),303);
}
