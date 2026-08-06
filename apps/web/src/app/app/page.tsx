import Link from "next/link";
import { ArrowUpRight, Building2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { OrganisationCreateForm } from "@/components/organisation-create-form";

export default async function AppHome(){
  const {supabase}=await requireUser();
  const {data,error}=await supabase.rpc("get_my_organisations");
  if(error)throw new Error(`Organisation access failed: ${error.code} ${error.message}`);
  const orgs=(data??[]) as Array<{organisation_id:string;name:string;slug:string;role:string}>;
  return <div className="mx-auto max-w-6xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Your organisations</h1><p className="mt-2 text-[#617083]">Choose a secure tenant or create your first workspace.</p></div></div><div className="mt-8 grid gap-5 lg:grid-cols-[1fr_360px]"><section className="grid content-start gap-3">{orgs?.length?orgs.map(o=><Link href={`/app/${o.organisation_id}`} key={o.organisation_id} className="ev-card flex items-center gap-4 p-5 transition hover:-translate-y-0.5"><span className="grid size-12 place-items-center rounded-xl bg-[#fff0e9] text-[#e8733f]"><Building2/></span><div className="flex-1"><h2 className="font-semibold">{o.name}</h2><p className="mt-1 text-xs uppercase tracking-[.1em] text-[#617083]">{String(o.role).replaceAll("_"," ")}</p></div><ArrowUpRight size={18}/></Link>):<div className="ev-card p-10 text-center text-[#617083]">No organisation memberships yet.</div>}</section><OrganisationCreateForm/></div></div>
}
