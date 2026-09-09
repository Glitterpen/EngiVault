import "server-only";
import {createClient as createSupabaseClient,type SupabaseClient} from "@supabase/supabase-js";
import {publicEnv} from "@/lib/env";
import {previewQuery,projectPreviewRow} from "@/lib/member-preview-query";
import type {AdminPreview} from "@/lib/admin-preview";

const readRpcs=new Set(['get_project_team','get_project_document_categories','get_pending_project_invitations','get_engineer_project_impact','can_register_documents','can_upload_document','search_project_member_preview']);
const files:Record<string,string>={authorize_revision_preview:'revision_preview',authorize_revision_download:'revision_download',authorize_revision_native_download:'revision_native_download',get_work_package_download:'work_package_download'};
const interdisciplinaryReads=new Set(['get_interdisciplinary_documents','get_interdisciplinary_revision','authorize_interdisciplinary_file']);

export function createMemberPreviewClient(actor:SupabaseClient,preview:AdminPreview):SupabaseClient{
  const env=publicEnv();
  async function read(resource:string,query:Record<string,unknown>={}){
    const {data,error}=await actor.rpc('read_project_member_preview',{target_preview:preview.sessionId,resource,query});
    if(error)throw new Error(`Member preview unavailable (${error.code}). Exit preview and retry.`);
    return data;
  }
  const transport:typeof fetch=async(input,init)=>{
    try{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    const method=(init?.method??'GET').toUpperCase();
    const headers=new Headers(init?.headers);
    const body=typeof init?.body==='string'?JSON.parse(init.body) as Record<string,unknown>:{};
    if(url.origin!==new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin)throw new Error('Preview request origin denied');
    if(url.pathname.startsWith('/storage/v1/object/')){
      const match=url.pathname.match(/^\/storage\/v1\/object\/(sign\/|authenticated\/)?([^/]+)\/(.+)$/);
      if(!match||!((method==='GET'&&match[1]!=='sign/')||(method==='POST'&&match[1]==='sign/')))throw new Error('File changes are disabled in preview');
      const bucket=decodeURIComponent(match[2]),path=decodeURIComponent(match[3]);
      await read('storage_object',{bucket,path});
      if(method==='GET'){
        const {data,error}=await actor.storage.from(bucket).download(path);
        if(error||!data)throw new Error('Preview file unavailable');
        return new Response(data);
      }
      const {data,error}=await actor.storage.from(bucket).createSignedUrl(path,Math.min(Number(body.expiresIn)||60,300));
      if(error||!data)throw new Error('Preview file unavailable');
      const signed=new URL(data.signedUrl);
      return Response.json({signedURL:signed.pathname.replace(/^\/storage\/v1/,'')+signed.search});
    }
    const match=url.pathname.match(/^\/rest\/v1\/(rpc\/)?([a-z][a-z0-9_]*)$/);
    if(!match)throw new Error('Operation disabled in member preview');
    const resource=match[2];
    let data:unknown,total:number|undefined;
    if(match[1]){
      if(!readRpcs.has(resource)&&!files[resource]&&!interdisciplinaryReads.has(resource))throw new Error('Changes are disabled in member preview');
      // The database obtains org/project/member from its validated session, never
      // from these caller-supplied RPC arguments.
      for(const key of ['target_organisation','org'])if(body[key]&&body[key]!==preview.organisationId)throw new Error('Preview organisation mismatch');
      for(const key of ['target_project','project'])if(body[key]&&body[key]!==preview.projectId)throw new Error('Preview project mismatch');
      if(interdisciplinaryReads.has(resource)){
        const result=await actor.rpc(resource,{...body,target_organisation:preview.organisationId,target_project:preview.projectId,target_preview:preview.sessionId});
        if(result.error)throw new Error('Approved reference unavailable to this member');
        data=result.data;
      }else data=await read(files[resource]??resource,body);
    }else{
      if(!['GET','HEAD'].includes(method))throw new Error('Changes are disabled in member preview');
      const {selection,query}=previewQuery(url);
      const result=await read(resource,query) as {rows:Record<string,unknown>[];total:number};
      data=result.rows.map(row=>projectPreviewRow(row,selection));total=result.total;
    }
    if(headers.get('accept')?.includes('vnd.pgrst.object+json')){
      if(!Array.isArray(data)||data.length!==1)return Response.json({code:'PGRST116',message:'Expected one preview row',details:`The result contains ${Array.isArray(data)?data.length:0} rows`},{status:406});
      data=data[0];
    }
    const responseHeaders:Record<string,string>={'content-type':'application/json','cache-control':'no-store'};
    if(total!==undefined)responseHeaders['content-range']=`0-${Math.max(0,(Array.isArray(data)?data.length:1)-1)}/${total}`;
    return new Response(method==='HEAD'?null:JSON.stringify(data),{headers:responseHeaders});
    }catch(error){
      // A denied delegated read is a terminal authorization response, not a
      // transport outage (the SDK would otherwise retry it as a network error).
      return Response.json({code:'ADMIN_PREVIEW_READ_ONLY',message:error instanceof Error?error.message:'Member preview unavailable'},{status:403});
    }
  };
  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport},
  });
}
