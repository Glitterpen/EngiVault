import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import {notFound} from "next/navigation";
import {requireUser} from "@/lib/auth";
import {DocumentCategoryCreateForm} from "@/components/document-category-create-form";
import {DocumentCategoryManagement} from "@/components/document-category-management";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import {ReadUnavailable} from "@/components/read-unavailable";

export default async function CategorySettingsPage({params}:{params:Promise<{organisationId:string}>}){
  const {organisationId}=await params;
  const {supabase}=await requireUser();
  const retryHref=`/app/${organisationId}/settings/document-categories`;
  const {data:organisations,error:accessError}=await supabase.rpc("get_my_organisations");
  if(accessError)return <ReadUnavailable title="Category access could not be checked" href={retryHref}/>;
  if(!organisations?.some((o:{organisation_id:string;role:string})=>o.organisation_id===organisationId&&o.role==="organisation_admin"))notFound();
  const {data,error}=await supabase.from("document_categories").select("id,kind,code,name,is_active").eq("organisation_id",organisationId).order("kind").order("sort_order");
  if(error)return <ReadUnavailable title="Document categories are temporarily unavailable" href={retryHref}/>;
  const categories=data??[];
  return <div className="mx-auto min-w-0 max-w-6xl">
    <Link href={`/app/${organisationId}`} className="mb-2 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#10243e]"><ArrowLeft size={16} aria-hidden="true"/> Organisation</Link>
    <WorkspacePageHeading title="Document categories" context="MDR administration"/>
    <div className="mt-5 grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
      <DocumentCategoryManagement organisationId={organisationId} categories={categories}/>
      <DocumentCategoryCreateForm organisationId={organisationId}/>
    </div>
  </div>;
}
