import {z} from "zod";
import {requireProject} from "@/lib/auth";
import {can} from "@/lib/permissions";
import {embedSearchQuery,generateGroundedAnswer} from "@/lib/processor";
import {rateLimited} from "@/lib/rate-limit";

const schema=z.object({question:z.string().trim().min(2).max(1000)});
type Evidence={chunk_id:string;document_id:string;revision_id:string;document_number:string;title:string;revision_code:string;locator_type:string;page_number:number|null;sheet_name:string|null;cell_range:string|null;content:string;score:number};

export async function POST(request:Request,ctx:{params:Promise<{organisationId:string;projectId:string;sessionId:string}>}){
  const {organisationId,projectId,sessionId}=await ctx.params;
  const {supabase,access}=await requireProject(organisationId,projectId);
  if(!can(String(access.role),"ai:use"))return Response.json({error:{code:"FORBIDDEN",message:"AI chat is not available for this role."}},{status:403});
  if(await rateLimited(supabase,organisationId,"ai-question",20,60))return Response.json({error:{code:"RATE_LIMITED",message:"Question rate exceeded. Try again shortly."}},{status:429,headers:{"Retry-After":"60"}});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:{code:"INVALID_QUESTION",message:"Enter a question between 2 and 1,000 characters."}},{status:422});
  const embedding=await embedSearchQuery(parsed.data.question);
  const {data,error}=await supabase.rpc("chat_retrieve_project",{target_organisation:organisationId,target_project:projectId,target_session:sessionId,query_text:parsed.data.question,query_embedding:embedding?`[${embedding.join(",")}]`:null,result_limit:10});
  if(error)return Response.json({error:{code:"RETRIEVAL_FAILED",message:"Authorised evidence could not be retrieved.",reference:error.code}},{status:503});
  const evidence=(data??[]) as Evidence[];
  let generated;
  if(!evidence.length){
    generated={answer:"The selected project evidence is insufficient to answer this question reliably.",grounded:false,source_ids:[],model:"none",provider_request_id:null,input_tokens:0,output_tokens:0,latency_ms:0};
  }else{
    try{generated=await generateGroundedAnswer(parsed.data.question,evidence.map(item=>({content:`Document ${item.document_number}, revision ${item.revision_code}, ${locator(item)}\n${item.content}`})))}
    catch{return Response.json({error:{code:"ANSWER_FAILED",message:"The evidence was retrieved, but the grounded answer service is temporarily unavailable."}},{status:503})}
  }
  const validSourceIds=[...new Set(generated.source_ids.filter(sourceId=>Number.isInteger(sourceId)&&sourceId>=1&&sourceId<=evidence.length))];
  if(generated.grounded&&validSourceIds.length!==generated.source_ids.length)return Response.json({error:{code:"INVALID_CITATIONS",message:"The answer was rejected because it cited evidence outside the authorised retrieval set."}},{status:502});
  generated.source_ids=validSourceIds;
  const citations=generated.source_ids.map((sourceId,labelIndex)=>{const source=evidence[sourceId-1];return {chunk_id:source.chunk_id,label:labelIndex+1,rank:sourceId,score:source.score}});
  if(generated.grounded&&!citations.length)return Response.json({error:{code:"INVALID_CITATIONS",message:"The answer was rejected because it did not cite retrieved evidence."}},{status:502});
  const retrieved=evidence.map(item=>({chunk_id:item.chunk_id,score:item.score}));
  const {data:messageId,error:recordError}=await supabase.rpc("record_grounded_answer",{target_session:sessionId,question:parsed.data.question,answer:generated.answer,is_grounded:generated.grounded,model_name:generated.model,provider_id:generated.provider_request_id,input_tokens:generated.input_tokens,output_tokens:generated.output_tokens,elapsed_ms:generated.latency_ms,retrieved,citations});
  if(recordError)return Response.json({error:{code:"ANSWER_RECORD_FAILED",message:"The answer could not be securely recorded.",reference:recordError.code}},{status:503});
  return Response.json({messageId,answer:generated.answer,grounded:generated.grounded,citations:citations.map((citation,index)=>{const source=evidence[generated.source_ids[index]-1];return {label:citation.label,documentId:source.document_id,revisionId:source.revision_id,documentNumber:source.document_number,revision:source.revision_code,page:source.page_number,sheet:source.sheet_name,cellRange:source.cell_range,excerpt:source.content.slice(0,500)}}),usage:{inputTokens:generated.input_tokens,outputTokens:generated.output_tokens,latencyMs:generated.latency_ms}},{headers:{"Cache-Control":"no-store"}});
}
function locator(item:Evidence){if(item.page_number)return `page ${item.page_number}`;return `${item.sheet_name??"sheet"} ${item.cell_range??""}`.trim()}
