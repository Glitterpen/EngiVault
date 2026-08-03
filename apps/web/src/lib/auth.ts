import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const requireUser=cache(async()=>{const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");return {supabase,user};});
export async function requireProject(orgId:string,projectId:string){const {supabase,user}=await requireUser();const {data}=await supabase.from("project_access").select("organisation_id,project_id,role").eq("organisation_id",orgId).eq("project_id",projectId).maybeSingle();if(!data)notFound();return {supabase,user,access:data};}
