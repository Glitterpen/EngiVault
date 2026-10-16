import {HelpTip} from "@/components/help-tip";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import {ReadUnavailable} from "@/components/read-unavailable";
import {TableScrollRegion} from "@/components/table-scroll-region";

type SearchParams={q?:string;organisationId?:string;projectId?:string};
type ProjectAccess={organisation_id:string;project_id:string;code:string;name:string;role:string};
type Organisation={organisation_id:string;name:string};

export default async function AllDocumentsPage({searchParams}:{searchParams:Promise<SearchParams>}){
  const filters=await searchParams;
  const q=(filters.q??"").replaceAll(/[,%()]/g,"").slice(0,100);
  const retryParams=new URLSearchParams();
  if(q)retryParams.set("q",q);
  if(filters.organisationId)retryParams.set("organisationId",filters.organisationId);
  if(filters.projectId)retryParams.set("projectId",filters.projectId);
  const retryHref=`/app/documents${retryParams.size?`?${retryParams}`:""}`;
  const {supabase}=await requireUser();
  const [{data:access,error:accessError},{data:orgs,error:organisationError}]=await Promise.all([
    supabase.from("project_access").select("organisation_id,project_id,code,name,role").order("name"),
    supabase.rpc("get_my_organisations"),
  ]);
  if(accessError||organisationError)return <ReadUnavailable title="Document workspace is temporarily unavailable" href={retryHref}>Your project and organisation details could not be verified. Retry loading this view.</ReadUnavailable>;
  const projects=(access??[]) as ProjectAccess[],organisationRows=(orgs??[]) as Organisation[];
  const organisations=new Map(organisationRows.map(org=>[org.organisation_id,org.name]));
  let query=supabase.from("documents").select("id,organisation_id,project_id,document_number,title,document_type,discipline,status,updated_at").order("updated_at",{ascending:false}).limit(200);
  if(filters.organisationId)query=query.eq("organisation_id",filters.organisationId);
  if(filters.projectId)query=query.eq("project_id",filters.projectId);
  if(q)query=query.or(`document_number.ilike.%${q}%,title.ilike.%${q}%`);
  const {data:documents,error}=await query;
  if(error)return <ReadUnavailable title="Documents are temporarily unavailable" href={retryHref}/>;
  const projectMap=new Map(projects.map(project=>[project.project_id,project]));
  return <div className="mx-auto max-w-7xl"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Your documents <HelpTip label="Cross-project documents">A secure cross-project view of documents you are authorised to access.</HelpTip></h1><form className="ev-card mt-6 grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_auto]"><label><span className="ev-label">Search</span><div className="relative"><Search className="absolute left-3 top-3.5 text-[#7a8796]" size={16}/><input name="q" defaultValue={q} className="ev-input pl-9" placeholder="Number or title"/></div></label><label><span className="ev-label">Organisation</span><select className="ev-input" name="organisationId" defaultValue={filters.organisationId??""}><option value="">All organisations</option>{organisationRows.map((org)=><option value={org.organisation_id} key={org.organisation_id}>{org.name}</option>)}</select></label><label><span className="ev-label">Project</span><select className="ev-input" name="projectId" defaultValue={filters.projectId??""}><option value="">All projects</option>{projects.filter(project=>!filters.organisationId||project.organisation_id===filters.organisationId).map(project=><option value={project.project_id} key={project.project_id}>{project.code} — {project.name}</option>)}</select></label><button className="ev-button self-end">Apply</button></form><TableScrollRegion label="Your documents — scroll horizontally" className="ev-card mt-5"><table className="w-full min-w-[900px] text-left"><caption className="sr-only">Your documents</caption><thead className="border-b bg-[#f8fafc] text-[10px] uppercase tracking-[.14em] text-[#617083]"><tr><th scope="col" className="p-4">Document</th><th scope="col">Organisation</th><th scope="col">Project</th><th scope="col">Type</th><th scope="col">Discipline</th><th scope="col">Status</th></tr></thead><tbody>{documents?.map(document=>{const project=projectMap.get(document.project_id);return <tr key={document.id} className="border-b last:border-0"><td className="p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-[#eef3fa] text-[#10243e]"><FileText size={16}/></span><div>{project&&project.organisation_id===document.organisation_id&&["document_controller","engineer","viewer"].includes(project.role)?<Link className="text-xs font-bold text-[#10243e] hover:underline" href={`/app/${document.organisation_id}/projects/${document.project_id}/documents/${document.id}`}>{document.document_number}</Link>:<span className="text-xs font-bold text-[#10243e]">{document.document_number}</span>}<p className="mt-1 max-w-sm truncate text-sm font-medium">{document.title}</p></div></div></td><td className="text-sm">{organisations.get(document.organisation_id)??"—"}</td><td className="text-sm">{project?.code??"—"}</td><td className="text-sm">{document.document_type}</td><td className="text-sm">{document.discipline}</td><td><span className="rounded-full bg-[#eef3fa] px-2.5 py-1 text-xs font-semibold">{document.status}</span></td></tr>})}{!documents?.length&&<tr><td colSpan={6} className="p-12 text-center text-[#617083]">No documents match this workspace view.</td></tr>}</tbody></table></TableScrollRegion></div>}
