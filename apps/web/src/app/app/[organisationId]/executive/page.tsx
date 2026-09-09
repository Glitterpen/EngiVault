import {notFound} from "next/navigation";
import {requireUser} from "@/lib/auth";
import {readAdminPreview} from "@/lib/admin-preview";
import {ExecutiveDashboard} from "@/components/executive-dashboard";
import {executivePortfolioSchema} from "@/lib/executive-portfolio";

export default async function ExecutivePage({params}:{params:Promise<{organisationId:string}>}){
  const {organisationId}=await params;
  const {supabase}=await requireUser();
  if(await readAdminPreview())notFound();
  const {data,error}=await supabase.rpc("get_executive_portfolio",{target_organisation:organisationId});
  if(error?.code==="42501")notFound();
  const result=executivePortfolioSchema.safeParse(data);
  if(error||!result.success)throw new Error("Executive status could not be loaded. Please retry.");
  return <ExecutiveDashboard portfolio={result.data}/>;
}
