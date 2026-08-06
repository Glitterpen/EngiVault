import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/proxy";
const safeMethods=new Set(["GET","HEAD","OPTIONS"]);
export async function proxy(request: NextRequest) {
  const requestId=request.headers.get("x-request-id")??crypto.randomUUID();
  if(!safeMethods.has(request.method)&&request.nextUrl.pathname.startsWith("/api/")){
    const origin=request.headers.get("origin");
    const publicHost=request.headers.get("x-forwarded-host")??request.headers.get("host");
    const publicProtocol=request.headers.get("x-forwarded-proto")??request.nextUrl.protocol.replace(":","");
    if(origin){const supplied=new URL(origin);if(supplied.host!==publicHost||supplied.protocol!==`${publicProtocol}:`)return NextResponse.json({error:{code:"ORIGIN_REJECTED",message:"Cross-origin requests are not accepted."}},{status:403,headers:{"x-request-id":requestId}})}
  }
  const response=await refreshSession(request);response.headers.set("x-request-id",requestId);response.headers.set("Cache-Control",request.nextUrl.pathname.startsWith("/app")?"private, no-store":"no-store");return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
