import {requireProject} from "@/lib/auth";
import {can} from "@/lib/permissions";
import {workspacePersona} from "@/lib/role-experience";
import {cleanMdrSearch,loadMdrFolderPage} from "@/lib/mdr-register-data";

type Params={organisationId:string;projectId:string};
const headers={"Cache-Control":"private, no-store","Vary":"Cookie"};
const unavailable=()=>Response.json({error:{message:"This discipline could not be loaded. Retry shortly."}},{status:503,headers});

export async function GET(request:Request,ctx:{params:Promise<Params>}){
  const search=new URL(request.url).searchParams;
  const discipline=search.get("discipline")?.trim()??"",rawPage=search.get("page")??"1";
  if(!discipline||discipline.length>200||/[\u0000-\u001f\u007f]/.test(discipline)||!/^\d+$/.test(rawPage)||!Number.isSafeInteger(Number(rawPage))||Number(rawPage)<1||Number(rawPage)>40000){
    return Response.json({error:{message:"Choose a discipline and a valid page."}},{status:422,headers});
  }
  const {organisationId,projectId}=await ctx.params;
  // This is the same member-scoped, RLS-enforced client as the MDR page. Never
  // replace it with the administrator's unrestricted client during a preview.
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  const role=String(access.role),persona=workspacePersona(role);
  const removed=search.get("records")==="removed";
  if(!can(role,"document:read")||persona==="management"||persona==="engineering"||(removed&&role!=="document_controller")){
    return Response.json({error:{message:"This register is not available for your project role."}},{status:403,headers});
  }
  try{
    const result=await loadMdrFolderPage(supabase,organisationId,projectId,removed?"archived":"active",cleanMdrSearch(search.get("q")??""),discipline,Number(rawPage));
    return Response.json({...result,canManage:can(role,"document:write")&&!preview},{headers});
  }catch{
    return unavailable();
  }
}
