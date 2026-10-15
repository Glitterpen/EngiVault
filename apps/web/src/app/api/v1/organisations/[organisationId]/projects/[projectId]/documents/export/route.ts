import {requireProject} from "@/lib/auth";
import {can} from "@/lib/permissions";
import {workspacePersona} from "@/lib/role-experience";
import {createMdrRegisterCsv,loadMdrRegisterExport} from "@/lib/mdr-register-export";

type Params={organisationId:string;projectId:string};
const headers={"Cache-Control":"private, no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff"};

export async function GET(request:Request,ctx:{params:Promise<Params>}){
  const {organisationId,projectId}=await ctx.params;
  // Preserve auth redirects and use the audited member-preview proxy where
  // applicable. A read-only preview may download, but never gets admin access.
  const {supabase,access}=await requireProject(organisationId,projectId);
  const role=String(access.role),persona=workspacePersona(role);
  const removed=new URL(request.url).searchParams.get("records")==="removed";
  if(!can(role,"document:read")||!can(role,"document:download")||persona==="management"||persona==="engineering"||(removed&&role!=="document_controller")){
    return Response.json({error:{message:"This register is not available for your project role."}},{status:403,headers});
  }
  try{
    const documents=await loadMdrRegisterExport(supabase,organisationId,projectId,removed?"archived":"active");
    // Do not interpolate organisation names, user input, or unchecked IDs into
    // response headers. The suffix is an ASCII-safe identifier only.
    const safeProject=projectId.replace(/[^a-zA-Z0-9-]/g,"").slice(0,64)||"project";
    return new Response(createMdrRegisterCsv(documents),{headers:{...headers,
      "Content-Type":"text/csv; charset=utf-8",
      "Content-Disposition":`attachment; filename="EngiCite-MDR-${safeProject}${removed?"-removed":""}.csv"`,
    }});
  }catch{
    return Response.json({error:{message:"The MDR download could not be prepared. Retry shortly."}},{status:503,headers});
  }
}
