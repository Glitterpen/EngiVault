import type {SupabaseClient} from "@supabase/supabase-js";
import type {DocumentSchedule} from "@/lib/document-schedule";
import type {ProjectDeliveryStage} from "@/lib/project-delivery-stage";
import type {DeliveryCurveReport,DeliveryCurveSubmissionProgress} from "@/lib/project-delivery-curve";

export type ProgressProject={code:string;name:string;delivery_stage:ProjectDeliveryStage|null;planned_start_date:string|null;planned_end_date:string|null};
export type ProgressDeliveryRow=DocumentSchedule&{document_id:string;document_number:string;title:string;discipline:string;progress_weight:number;progress_credit:number;uploaded:boolean;issue_status:string|null;planned_final_date:string|null};
export type ProgressIssue={id:string;severity:string;status:string};
type ListResult={data:unknown;error:unknown;count:number|null};
const PAGE_SIZE=500,MAX_ROWS=50000;

/** Exact, stable, member-scoped reads. A partial source never becomes a zero. */
export async function loadProjectProgressData(client:SupabaseClient,organisationId:string,projectId:string,{includeHistory}:{includeHistory:boolean}){
  const scope=(table:string,selection:string)=>client.from(table).select(selection,{count:"exact"}).eq("organisation_id",organisationId).eq("project_id",projectId);
  async function allRows<T>(queryPage:(from:number,to:number)=>PromiseLike<ListResult>,key:keyof T):Promise<T[]|null>{
    try{
      const rows:T[]=[],seen=new Set<string>();let expected:number|undefined;
      do{
        const result=await queryPage(rows.length,rows.length+PAGE_SIZE-1);
        if(result.error||!Array.isArray(result.data)||result.data.length>PAGE_SIZE||!Number.isSafeInteger(result.count)||result.count===null||result.count<0||result.count>MAX_ROWS)return null;
        if(expected!==undefined&&result.count!==expected)return null;
        expected=result.count;
        if(rows.length+result.data.length>expected||(!result.data.length&&rows.length<expected))return null;
        for(const row of result.data as T[]){
          if(!row||typeof row!=="object")return null;
          const id=row[key];
          if(typeof id!=="string"||!id.trim()||seen.has(id))return null;
          seen.add(id);rows.push(row);
        }
      }while(rows.length<expected);
      return rows;
    }catch{return null;}
  }
  const projectRead=async()=>{
    try{
      const {data,error}=await client.from("projects").select("code,name,delivery_stage,planned_start_date,planned_end_date").eq("organisation_id",organisationId).eq("id",projectId).single();
      return !error&&data&&typeof data.code==="string"&&typeof data.name==="string"?data as ProgressProject:null;
    }catch{return null;}
  };
  const submissionRead=async():Promise<DeliveryCurveSubmissionProgress|null>=>{
    try{
      const {data,error}=await client.rpc("get_project_submission_progress",{target_organisation:organisationId,target_project:projectId});
      if(error||!data||typeof data!=="object"||Array.isArray(data))return null;
      const {version,captured_at,submitted_progress,accepted_progress,total_deliverables,total_weight}=data;
      if(version!==1||typeof captured_at!=="string"||!Number.isFinite(Date.parse(captured_at))
        ||typeof submitted_progress!=="number"||!Number.isFinite(submitted_progress)||submitted_progress<0||submitted_progress>100
        ||typeof accepted_progress!=="number"||!Number.isFinite(accepted_progress)||accepted_progress<0||accepted_progress>submitted_progress
        ||!Number.isSafeInteger(total_deliverables)||total_deliverables<0
        ||typeof total_weight!=="number"||!Number.isFinite(total_weight)||total_weight<0)return null;
      // Only aggregate observations cross this boundary, never revision/file data.
      return {version:1,captured_at,submitted_progress,accepted_progress,total_deliverables,total_weight};
    }catch{return null;}
  };
  const [project,rows,reports,issues,submissionProgress]=await Promise.all([
    projectRead(),
    allRows<ProgressDeliveryRow>((from,to)=>scope("project_document_progress","document_id,document_number,title,discipline,progress_weight,progress_credit,uploaded,overdue,issue_status,planned_submission_date,planned_final_date,next_submission_date,last_issue_date,revision_cycle_days,deadline_kind").eq("lifecycle_status","active").order("document_id").range(from,to),"document_id"),
    includeHistory?allRows<DeliveryCurveReport>((from,to)=>scope("project_weekly_reports","id,period_end,generated_at,snapshot").order("id").range(from,to),"id"):Promise.resolve(null),
    allRows<ProgressIssue>((from,to)=>scope("project_issues","id,severity,status").neq("status","resolved").order("id").range(from,to),"id"),
    includeHistory?submissionRead():Promise.resolve(null),
  ]);
  return {project,rows,reports,issues,submissionProgress};
}
