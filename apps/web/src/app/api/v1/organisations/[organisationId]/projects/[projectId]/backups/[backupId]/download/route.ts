import {NextResponse} from "next/server";
import {requireProject} from "@/lib/auth";

export async function GET(request:Request,{params}:{params:Promise<{organisationId:string;projectId:string;backupId:string}>}){
 const {organisationId,projectId,backupId}=await params;const {supabase,actualRole}=await requireProject(organisationId,projectId);
 if(actualRole!=="organisation_admin")return Response.json({error:{code:"FORBIDDEN",message:"Organisation administrator permission is required."}},{status:403});
 const {data,error}=await supabase.rpc("get_project_backup_download",{target_backup:backupId});const row=Array.isArray(data)?data[0]:data;
 if(error||!row?.storage_key)return Response.json({error:{code:"BACKUP_UNAVAILABLE",message:"This backup is not ready for download.",reference:error?.code}},{status:404});
 const {data:signed,error:signError}=await supabase.storage.from("project-backups").createSignedUrl(row.storage_key,120,{download:row.filename});
 if(signError||!signed?.signedUrl)return Response.json({error:{code:"SIGN_FAILED",message:"Secure backup download could not be created."}},{status:503});
 return NextResponse.redirect(new URL(signed.signedUrl,request.url),302);
}
