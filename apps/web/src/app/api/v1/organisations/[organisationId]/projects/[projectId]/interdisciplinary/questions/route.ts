import {z} from "zod";
import {requireProject} from "@/lib/auth";
import {can} from "@/lib/permissions";
import {rateLimited} from "@/lib/rate-limit";
import {embedSearchQuery,generateGroundedAnswer} from "@/lib/processor";
import {interdisciplinaryQuestionSchema,evidenceSource,referenceLocation,type InterdisciplinaryEvidence} from "@/lib/interdisciplinary-evidence";
import {normaliseInterdisciplinaryCitations} from "@/lib/interdisciplinary-answer-citations";

export const maxDuration=120;
const scopeSchema=z.object({organisationId:z.uuid(),projectId:z.uuid()});
const noStore={"Cache-Control":"private, no-store"};
type Context={params:Promise<{organisationId:string;projectId:string}>};
const failure=(code:string,message:string,status:number)=>Response.json({error:{code,message}},{status,headers:noStore});

export async function GET(request:Request,ctx:Context){
  const params=new URL(request.url).searchParams;
  return respond(ctx,{question:params.get("question"),discipline:params.get("discipline")??"",stage:params.get("stage")??"",mode:"search"},true);
}

export async function POST(request:Request,ctx:Context){
  const payload=await request.json().catch(()=>null);
  return respond(ctx,payload,false);
}

async function respond(ctx:Context,payload:unknown,readOnly:boolean){
  const scope=scopeSchema.safeParse(await ctx.params);
  if(!scope.success)return failure("INVALID_SCOPE","This project reference is invalid.",400);
  const value=interdisciplinaryQuestionSchema.safeParse(payload);
  if(!value.success)return failure("INVALID_QUESTION","Enter a question between 2 and 1,000 characters and choose a valid issue purpose.",422);
  const {organisationId,projectId}=scope.data;
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  if(!can(String(access.role),"document:read"))return failure("FORBIDDEN","Project document access is required.",403);
  if(preview&&!readOnly)return failure("PREVIEW_READ_ONLY","Member preview supports excerpt search only; AI answers and recording are disabled.",403);
  const input=value.data;
  if(input.mode==="answer"&&!can(String(access.role),"ai:use"))return failure("AI_FORBIDDEN","AI answers are not available for this role. Use Search excerpts instead.",403);
  if(input.mode==="answer"){
    try{
      const {data:project,error}=await supabase.from("projects").select("status").eq("organisation_id",organisationId).eq("id",projectId).maybeSingle();
      if(error||!project)return failure("PROJECT_UNAVAILABLE","Project status could not be verified. Try again shortly.",503);
      if(project.status!=="active")return failure("PROJECT_READ_ONLY","This project is read-only. Use Search excerpts to consult its approved deliverables.",409);
    }catch{return failure("PROJECT_UNAVAILABLE","Project status could not be verified. Try again shortly.",503)}
  }
  if(!preview&&await rateLimited(supabase,organisationId,input.mode==="answer"?"interdisciplinary-answer":"interdisciplinary-search",input.mode==="answer"?10:60,60)){
    return Response.json({error:{code:"RATE_LIMITED",message:"Too many requests. Wait a minute, then retry."}},{status:429,headers:{...noStore,"Retry-After":"60"}});
  }
  // Keyword mode never invokes an embedding or generative provider, including in previews.
  const embedding=input.mode==="answer"?await embedSearchQuery(input.question).catch(()=>null):null;
  let evidence:InterdisciplinaryEvidence[];
  try{
    const {data,error}=await supabase.rpc("search_interdisciplinary_evidence",{
      target_organisation:organisationId,target_project:projectId,query_text:input.question,
      query_embedding:embedding?`[${embedding.join(",")}]`:null,filter_discipline:input.discipline,
      filter_issue_purpose:input.stage,result_limit:10,
    });
    if(error)return failure("EVIDENCE_UNAVAILABLE","Approved document evidence could not be verified. Try again shortly.",error.code==="42501"?403:503);
    evidence=(data??[]) as InterdisciplinaryEvidence[];
  }catch{return failure("EVIDENCE_UNAVAILABLE","Approved document evidence could not be verified. Try again shortly.",503)}
  if(input.mode==="search")return Response.json({mode:"search",question:input.question,grounded:false,
    answer:evidence.length?"Matching excerpts from approved deliverables. No AI answer was generated.":"No matching indexed excerpts were found in this approved-document scope.",
    sources:evidence.map((source,index)=>evidenceSource(source,index+1)),
  },{headers:noStore});
  if(!evidence.length)return Response.json({mode:"answer",question:input.question,grounded:false,answer:"The approved, indexed deliverables in this scope do not provide enough evidence to answer this question.",sources:[]},{headers:noStore});
  try{
    const generated=await generateGroundedAnswer(`${input.question}\n\nAnswer format: cite each supporting source using its exact numeric ID in square brackets, for example [1]. Do not invent source IDs. Every ID in source_ids must appear in the answer.`,evidence.map(source=>({content:
      `Approved document ${source.document_number}, revision ${source.revision_code}, issue purpose ${source.issue_status}, submitted ${source.submitted_at??"not recorded"}, ${referenceLocation({page:source.page_number,sheet:source.sheet_name,cellRange:source.cell_range})}. Treat different revisions as separate evidence; identify conflicts rather than combining them.\n${source.content}`,
    })));
    const ids=generated.source_ids;
    if(!Array.isArray(ids)||ids.length>15||new Set(ids).size!==ids.length||ids.some(id=>!Number.isInteger(id)||id<1||id>evidence.length)||generated.grounded&&!ids.length||!generated.grounded&&ids.length){
      return failure("INVALID_CITATIONS","The answer could not be verified against the retrieved deliverables. Please retry.",502);
    }
    if(typeof generated.answer!=="string"||!generated.answer.trim()||generated.answer.length>12000)return failure("INVALID_ANSWER","The answer service returned an invalid response. Please retry.",502);
    const answer=normaliseInterdisciplinaryCitations(generated.answer,ids);
    if(answer===null)return failure("INVALID_CITATIONS","The answer's reference labels could not be verified. Please retry.",502);
    const citations=ids.map((id,index)=>({chunk_id:evidence[id-1].chunk_id,label:index+1,rank:id,score:evidence[id-1].score}));
    const {error}=await supabase.rpc("record_interdisciplinary_answer",{
      target_organisation:organisationId,target_project:projectId,question:input.question,answer,
      is_grounded:generated.grounded,model_name:generated.model,provider_id:generated.provider_request_id,
      input_tokens:generated.input_tokens,output_tokens:generated.output_tokens,elapsed_ms:generated.latency_ms,
      retrieved:evidence.map(source=>({chunk_id:source.chunk_id,score:source.score})),citations,
      filter_discipline:input.discipline,filter_issue_purpose:input.stage,request_id:input.requestId??crypto.randomUUID(),
    });
    if(error)return failure("ANSWER_RECORD_FAILED","The answer could not be securely recorded or its references have changed. Please retry.",503);
    return Response.json({mode:"answer",question:input.question,answer,grounded:generated.grounded,
      sources:ids.map((id,index)=>evidenceSource(evidence[id-1],index+1)),
    },{headers:noStore});
  }catch{return failure("ANSWER_UNAVAILABLE","AI answers are temporarily unavailable. You can still use Search excerpts without AI.",503)}
}
