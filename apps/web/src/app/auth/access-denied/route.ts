import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

export async function GET(request:Request){
  const supabase=await createClient();
  await supabase.auth.signOut();
  const destination=new URL("/login",request.url);
  destination.searchParams.set("access","required");
  return NextResponse.redirect(destination);
}
