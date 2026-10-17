// @vitest-environment node
import {expect,it,vi} from "vitest";
import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import type {AdminPreview} from "@/lib/admin-preview";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/env",()=>({publicEnv:()=>({NEXT_PUBLIC_SUPABASE_URL:"https://preview.example.test",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"public-placeholder-key-for-test"})}));
import {createMemberPreviewClient} from "@/lib/member-preview-client";
import {readBrowsePage} from "@/lib/read-only-browse";

const preview:AdminPreview={sessionId:"preview-session",organisationId:"org",projectId:"project",memberId:"member",role:"document_controller",displayName:"DCC",email:"dcc@example.test",disciplines:[],expiresAt:"2099-01-01"};
it("real SDK preserves exact HEAD counts and offset ranges through the audited read-only transport",async()=>{
  const rpc=vi.fn().mockResolvedValueOnce({data:{rows:[{id:"count-only"}],total:178},error:null})
    .mockResolvedValueOnce({data:{rows:Array.from({length:25},(_,index)=>({id:`notice-${index+25}`})),total:178},error:null});
  const client=createMemberPreviewClient({rpc} as unknown as SupabaseClient,preview);
  const head=await client.from("notifications").select("id",{count:"exact",head:true}).eq("recipient_user_id","member").is("read_at",null).limit(1);
  expect(head.error).toBeNull();expect(head.data).toBeNull();expect(head.count).toBe(178);
  const result=await readBrowsePage(async(start,end)=>client.from("notifications").select("id",{count:"exact"}).eq("recipient_user_id","member").order("created_at",{ascending:false}).order("id",{ascending:false}).range(start,end),2);
  expect(result).toMatchObject({page:2,pages:8,total:178});expect(result.items).toHaveLength(25);
  expect(rpc.mock.calls[0]).toEqual(["read_project_member_preview",expect.objectContaining({target_preview:"preview-session",resource:"notifications",query:expect.objectContaining({limit:1,offset:0,filters:[{column:"recipient_user_id",op:"eq",value:"member",not:false},{column:"read_at",op:"is",value:"null",not:false}]})})]);
  expect(rpc.mock.calls[1][1]).toMatchObject({target_preview:"preview-session",resource:"notifications",query:{limit:25,offset:25}});
});

it("real SDK recovers an HTTP 416 range error without losing recipient or search scope",async()=>{
  const rows=Array.from({length:28},(_,index)=>({id:`notice-${index}`})),requests:URL[]=[];
  const fetch=vi.fn(async(input:RequestInfo|URL)=>{
    const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);requests.push(url);
    const offset=Number(url.searchParams.get("offset")??0),limit=Number(url.searchParams.get("limit")??25);
    if(offset>=rows.length)return new Response(JSON.stringify({code:"PGRST103",message:"Requested range not satisfiable",details:"An offset of 125 was requested, but there are only 28 rows."}),{status:416,headers:{"content-type":"application/json","content-range":"*/28"}});
    return new Response(JSON.stringify(rows.slice(offset,offset+limit)),{status:200,headers:{"content-type":"application/json","content-range":`${offset}-${Math.min(offset+limit,rows.length)-1}/28`}});
  });
  const client=createClient("https://scope.example.test","public-placeholder-key-for-test",{global:{fetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const result=await readBrowsePage(async(start,end)=>client.from("notifications").select("id",{count:"exact"}).eq("recipient_user_id","member").is("read_at",null).or("title.ilike.%cable%,body.ilike.%cable%").order("created_at",{ascending:false}).order("id",{ascending:false}).range(start,end),6);
  expect(result).toMatchObject({page:2,pages:2,total:28,items:rows.slice(25)});
  expect(requests.map(url=>url.searchParams.get("offset"))).toEqual(["125","0","25"]);
  for(const url of requests){expect(url.searchParams.get("recipient_user_id")).toBe("eq.member");expect(url.searchParams.get("read_at")).toBe("is.null");expect(url.searchParams.get("or")).toBe("(title.ilike.%cable%,body.ilike.%cable%)");}
});

it("audited preview clamps its successful empty range response without extra authority",async()=>{
  const rpc=vi.fn().mockResolvedValueOnce({data:{rows:[],total:28},error:null}).mockResolvedValueOnce({data:{rows:[{id:"25"},{id:"26"},{id:"27"}],total:28},error:null});
  const client=createMemberPreviewClient({rpc} as unknown as SupabaseClient,preview);
  const result=await readBrowsePage(async(start,end)=>client.from("notifications").select("id",{count:"exact"}).eq("recipient_user_id","member").range(start,end),6);
  expect(result).toMatchObject({page:2,total:28,items:[{id:"25"},{id:"26"},{id:"27"}]});
  expect(rpc.mock.calls.map(call=>call[1].query.offset)).toEqual([125,25]);
  for(const call of rpc.mock.calls)expect(call[1]).toMatchObject({target_preview:"preview-session",resource:"notifications",query:{filters:[{column:"recipient_user_id",op:"eq",value:"member",not:false}]}});
});
