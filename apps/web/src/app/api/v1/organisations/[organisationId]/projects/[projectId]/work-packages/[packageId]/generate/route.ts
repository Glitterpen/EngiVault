import {requireProject} from "@/lib/auth";
import {can} from "@/lib/permissions";
import {buildWorkPackage} from "@/lib/processor";

export async function POST(_:Request,{params}:{params:Promise<{organisationId:string;projectId:string;packageId:string}>}){
  const {organisationId,projectId,packageId}=await params;
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  if(preview)return Response.json({error:{code:"ADMIN_PREVIEW_READ_ONLY",message:"Exit administrator role preview before generating a package."}},{status:423});
  if(!can(String(access.role),"document:write"))return Response.json({error:{code:"FORBIDDEN",message:"Document control permission is required."}},{status:403});
  const {error}=await supabase.rpc("request_work_package_generation",{target_package:packageId});
  if(error){
    if(error.code==="55000"&&error.message==="work_package_selection_required")return Response.json({error:{code:"PACKAGE_SELECTION_REQUIRED",message:"Reload the package and save a valid revision or an exclusion for each document before generating the ZIP."}},{status:409});
    return Response.json({error:{code:"PACKAGE_UNAVAILABLE",message:"Package cannot be generated in its current state.",reference:error.code}},{status:409});
  }
  if(!(await buildWorkPackage(packageId)))return Response.json({error:{code:"GENERATION_FAILED",message:"The ZIP could not be assembled. Try again; if it still fails, contact support."}},{status:503});
  return Response.json({state:"ready"});
}
