import {requireProject} from "@/lib/auth";
import {buildProjectReportPdf,projectReportPdfFilename} from "@/lib/project-report-pdf";
import {projectReportSnapshotSchema} from "@/lib/project-report";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

type ReportRow={id:string;report_number:number;period_start:string;period_end:string;generation_source:string;generated_at:string;snapshot:unknown};
type LogoAsset={bytes:Uint8Array;mimeType:string};

export async function GET(_:Request,{params}:{params:Promise<{organisationId:string;projectId:string;reportId:string}>}){
  const {organisationId,projectId,reportId}=await params;
  const {supabase}=await requireProject(organisationId,projectId);
  const [{data:report},{data:project}]=await Promise.all([
    supabase.from("project_weekly_reports").select("id,report_number,period_start,period_end,generation_source,generated_at,snapshot").eq("organisation_id",organisationId).eq("project_id",projectId).eq("id",reportId).maybeSingle(),
    supabase.from("projects").select("client_logo_paths").eq("organisation_id",organisationId).eq("id",projectId).maybeSingle(),
  ]);
  if(!report)return Response.json({error:{code:"REPORT_NOT_FOUND",message:"The project report is unavailable."}},{status:404,headers:{"cache-control":"private, no-store"}});
  const controlled=report as ReportRow;
  const parsed=projectReportSnapshotSchema.safeParse(controlled.snapshot);
  if(!parsed.success)return Response.json({error:{code:"REPORT_INVALID",message:"The saved project report is incomplete."}},{status:422,headers:{"cache-control":"private, no-store"}});

  const organisationLogo=await downloadAsset(supabase,"organisation-assets",`${organisationId}/branding/company-logo`);
  const paths=Array.isArray(project?.client_logo_paths)?project.client_logo_paths.filter((value):value is string=>typeof value==="string").slice(0,3):[];
  const clientLogos=(await Promise.all(paths.map(path=>downloadAsset(supabase,"project-assets",path)))).filter((value):value is LogoAsset=>Boolean(value));
  const bytes=await buildProjectReportPdf({
    snapshot:parsed.data,
    report:{reportNumber:controlled.report_number,periodStart:controlled.period_start,periodEnd:controlled.period_end,generationSource:controlled.generation_source,generatedAt:controlled.generated_at},
    organisationLogo,
    clientLogos,
  });
  await supabase.rpc("record_project_report_download",{target_organisation:organisationId,target_project:projectId,target_report:reportId});
  const filename=projectReportPdfFilename(parsed.data.identity.project_code,controlled.report_number);
  return new Response(Uint8Array.from(bytes).buffer,{status:200,headers:{
    "content-type":"application/pdf",
    "content-disposition":`attachment; filename="${filename}"`,
    "content-length":String(bytes.byteLength),
    "cache-control":"private, no-store, max-age=0",
    "x-content-type-options":"nosniff",
  }});
}

async function downloadAsset(supabase:Awaited<ReturnType<typeof requireProject>>["supabase"],bucket:string,path:string):Promise<LogoAsset|null>{
  const {data,error}=await supabase.storage.from(bucket).download(path);
  if(error||!data)return null;
  return {bytes:new Uint8Array(await data.arrayBuffer()),mimeType:data.type||"application/octet-stream"};
}
