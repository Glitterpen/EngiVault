import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {buildDisciplineAssignmentScopes,type AssignmentDocument,type ActiveDocumentAssignment,type DisciplineAssignmentEngineer,type DisciplineAssignmentScope} from "@/lib/discipline-assignment-scopes";

const PAGE_SIZE=500;
type Page<Row>={data:Row[]|null;error:unknown;count:number|null};
async function readAll<Row>(read:(offset:number)=>PromiseLike<Page<Row>>):Promise<Row[]>{
  const rows:Row[]=[];
  for(;;){
    const {data,error,count}=await read(rows.length);
    if(error||!data||count===null)throw new Error("Assignment status unavailable");
    rows.push(...data);
    if(rows.length>=count)return rows;
    if(!data.length)throw new Error("Assignment status incomplete");
  }
}

export async function loadDisciplineAssignmentScopes(supabase:SupabaseClient,organisationId:string,projectId:string,engineers:DisciplineAssignmentEngineer[]):Promise<{available:boolean;scopes:DisciplineAssignmentScope[]}>{
  try{
    // Never infer assignment completion from the visible MDR page or a capped
    // metadata query. These reads also work through the read-only preview client.
    const [documents,assignments]=await Promise.all([
      readAll<AssignmentDocument>(offset=>supabase.from("documents").select("id,discipline",{count:"exact"})
        .eq("organisation_id",organisationId).eq("project_id",projectId).eq("lifecycle_status","active").order("id").range(offset,offset+PAGE_SIZE-1)),
      readAll<ActiveDocumentAssignment>(offset=>supabase.from("document_assignments").select("id,document_id,user_id",{count:"exact"})
        .eq("organisation_id",organisationId).eq("project_id",projectId).eq("status","active").order("id").range(offset,offset+PAGE_SIZE-1)),
    ]);
    return {available:true,scopes:buildDisciplineAssignmentScopes(documents,assignments,engineers)};
  }catch{
    // A failed read must not present previously assigned work as unassigned.
    return {available:false,scopes:[]};
  }
}
