import {NextResponse,type NextRequest} from "next/server";

const cookieName="engicite_admin_preview";

export function proxy(request:NextRequest){
  if(["GET","HEAD","OPTIONS"].includes(request.method))return NextResponse.next();
  const value=request.cookies.get(cookieName)?.value;
  if(!value)return NextResponse.next();
  const [organisationId,projectId]=value.split(":");
  const projectPath=`/${organisationId}/projects/${projectId}`;
  if(request.nextUrl.pathname.includes(projectPath)){
    return NextResponse.json({error:{code:"ADMIN_PREVIEW_READ_ONLY",message:"Exit administrator role preview before changing project data."}},{status:423});
  }
  return NextResponse.next();
}

export const config={matcher:["/app/:path*","/api/v1/:path*"]};
