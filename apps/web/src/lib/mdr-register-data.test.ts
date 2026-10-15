// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {cleanMdrSearch,loadMdrDisciplineIndex,loadMdrFolderPage} from "./mdr-register-data";
import {loadDocumentSchedules} from "@/lib/document-schedule";
import type {DocumentSchedule} from "@/lib/document-schedule";
import {createMemberPreviewClient} from "@/lib/member-preview-client";
import type {AdminPreview} from "@/lib/admin-preview";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/document-schedule",()=>({loadDocumentSchedules:vi.fn()}));
vi.mock("@/lib/env",()=>({publicEnv:()=>({NEXT_PUBLIC_SUPABASE_URL:"https://preview.example.test",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"public-placeholder-key-for-test"})}));

type Row={id:string;discipline:string;document_number:string;title:string;document_type:string};
type Read={selection:string;head:boolean;filters:{column:string;value:unknown}[];orders:string[];range:[number,number]|null;or:string|null};
type Result={data:Row[]|null;count:number|null;error:unknown};
function document(id:number,discipline="Electrical"):Row{
  return {id:String(id).padStart(5,"0"),discipline,document_number:`DOC-${String(id).padStart(5,"0")}`,title:`Deliverable ${id}`,document_type:"Drawing"};
}
function fixture(rows:Row[],options:{cap?:number;override?:(read:Read,index:number,result:Result)=>Result}={}){
  const reads:Read[]=[];
  const from=vi.fn((table:string)=>{
    expect(table).toBe("documents");
    const read:Read={selection:"",head:false,filters:[],orders:[],range:null,or:null};
    const execute=()=>{
      const discipline=read.filters.find(filter=>filter.column==="discipline")?.value;
      let matches=discipline===undefined?rows:rows.filter(row=>row.discipline===discipline);
      if(read.or){
        const term=read.or.match(/\.ilike\.%([^%]*)%/)?.[1]?.toLowerCase()??"";
        matches=matches.filter(row=>[row.document_number,row.title,row.discipline,row.document_type].some(value=>value.toLowerCase().includes(term)));
      }
      matches=[...matches].sort((a,b)=>{
        for(const column of read.orders){const order=String(a[column as keyof Row]).localeCompare(String(b[column as keyof Row]));if(order)return order;}
        return 0;
      });
      const count=matches.length;
      const [start,end]=read.range??[0,count-1];
      const result:Result={data:read.head?null:matches.slice(start,Math.min(end+1,start+(options.cap??Number.MAX_SAFE_INTEGER))),count,error:null};
      const index=reads.push(read)-1;
      return options.override?.(read,index,result)??result;
    };
    const query={
      select:vi.fn((selection:string,config?:{head?:boolean})=>{read.selection=selection;read.head=Boolean(config?.head);return query;}),
      eq:vi.fn((column:string,value:unknown)=>{read.filters.push({column,value});return query;}),
      order:vi.fn((column:string)=>{read.orders.push(column);return query;}),
      limit:vi.fn(()=>query),
      range:vi.fn((start:number,end:number)=>{read.range=[start,end];return query;}),
      or:vi.fn((value:string)=>{read.or=value;return query;}),
      then:(resolve:(result:Result)=>unknown,reject?:(error:unknown)=>unknown)=>Promise.resolve(execute()).then(resolve,reject),
    };
    return query;
  });
  return {client:{from} as unknown as SupabaseClient,reads,from};
}
beforeEach(()=>{
  vi.clearAllMocks();
  vi.mocked(loadDocumentSchedules).mockImplementation(async(_client,_org,_project,ids)=>new Map(ids.map(id=>[id,{document_id:id,deadline_kind:"first_issue",overdue:false} as DocumentSchedule])));
});
function expectScoped(read:Read,records="active"){
  expect(read.filters).toEqual(expect.arrayContaining([
    {column:"organisation_id",value:"org"},{column:"project_id",value:"project"},{column:"lifecycle_status",value:records},
  ]));
}

it("cleans one bounded search term without breaking the OR grammar",()=>{
  expect(cleanMdrSearch('  Process,(MTO)% "draft"\\\n  ')).toBe("ProcessMTO draft");
  expect(cleanMdrSearch("x".repeat(150))).toHaveLength(100);
  expect(cleanMdrSearch("Électrical & Instrumentation")).toBe("Électrical & Instrumentation");
});

describe("MDR discipline index",()=>{
  it("enumerates disciplines beyond 1,000 rows with exact counts and stable scoped pages",async()=>{
    const rows=Array.from({length:1108},(_,id)=>document(id,id<700?"Electrical":id<1100?"Process":"Telecom"));
    const data=fixture(rows);
    expect(await loadMdrDisciplineIndex(data.client,"org","project","active","")).toEqual({total:1108,disciplines:[{name:"Electrical",count:700},{name:"Process",count:400},{name:"Telecom",count:8}]});
    expect(data.reads.map(read=>read.range)).toEqual([[0,499],[500,999],[1000,1499]]);
    for(const read of data.reads){expectScoped(read);expect(read.orders).toEqual(["id"]);expect(read.selection).toBe("id,discipline");}
  });
  it("continues after a short response when the server cap is below 500",async()=>{
    const data=fixture(Array.from({length:5},(_,id)=>document(id,id===4?"Civil":"Electrical")),{cap:2});
    expect((await loadMdrDisciplineIndex(data.client,"org","project","archived","")).disciplines).toEqual([{name:"Civil",count:1},{name:"Electrical",count:4}]);
    expect(data.reads.map(read=>read.range?.[0])).toEqual([0,2,4]);
    data.reads.forEach(read=>expectScoped(read,"archived"));
  });
  it("searches number, title, discipline and document type consistently across all index pages",async()=>{
    const data=fixture([document(1),{...document(2,"Process"),document_type:"MTO"},{...document(3,"Civil"),title:"MTO summary"}]);
    expect(await loadMdrDisciplineIndex(data.client,"org","project","active"," (MTO),% ")).toEqual({total:2,disciplines:[{name:"Civil",count:1},{name:"Process",count:1}]});
    expect(data.reads[0].or).toBe("document_number.ilike.%MTO%,title.ilike.%MTO%,discipline.ilike.%MTO%,document_type.ilike.%MTO%");
  });
  it("returns an actual empty index without adding unused catalogue disciplines",async()=>{
    expect(await loadMdrDisciplineIndex(fixture([]).client,"org","project","active","")).toEqual({total:0,disciplines:[]});
  });
  it("rejects later-page failure instead of returning partial discipline counts",async()=>{
    const data=fixture(Array.from({length:501},(_,id)=>document(id)),{override:(_read,index,result)=>index===1?{...result,data:null,error:{message:"sensitive database failure"}}:result});
    await expect(loadMdrDisciplineIndex(data.client,"org","project","active","")).rejects.toThrow("The MDR could not be loaded");
  });
  it.each(["missing count","drift","premature empty","duplicate","malformed discipline"])("rejects %s rather than silently truncating",async problem=>{
    const data=fixture([document(0),document(1)],{cap:1,override:(_read,index,result)=>{
      if(problem==="missing count")return {...result,count:null};
      if(problem==="drift"&&index===1)return {...result,count:3};
      if(problem==="premature empty"&&index===1)return {...result,data:[]};
      if(problem==="duplicate"&&index===1)return {...result,data:[document(0)]};
      if(problem==="malformed discipline")return {...result,data:[{...document(0),discipline:""}]};
      return result;
    }});
    await expect(loadMdrDisciplineIndex(data.client,"org","project","active","")).rejects.toThrow();
  });
});

describe("MDR folder pages",()=>{
  it("reads one discipline, tenant and lifecycle only with 25-document local pagination",async()=>{
    const data=fixture([...Array.from({length:56},(_,id)=>document(id)),document(100,"Process")]);
    const result=await loadMdrFolderPage(data.client,"org","project","archived","","Electrical",2);
    expect(result).toMatchObject({total:56,page:2,pageSize:25});
    expect(result.documents).toHaveLength(25);
    expect(result.documents[0].id).toBe("00025");
    expect(result.documents[24].id).toBe("00049");
    expect(data.reads[0].head).toBe(true);
    expect(data.reads[1].orders).toEqual(["document_number","id"]);
    expect(data.reads[1].range).toEqual([25,49]);
    for(const read of data.reads){expectScoped(read,"archived");expect(read.filters).toContainEqual({column:"discipline",value:"Electrical"});}
    expect(loadDocumentSchedules).toHaveBeenCalledExactlyOnceWith(data.client,"org","project",result.documents.map(row=>row.id));
    expect(result.documents[0].schedule.document_id).toBe("00025");
  });
  it("clamps a stale page to the current final page before reading records",async()=>{
    const data=fixture(Array.from({length:26},(_,id)=>document(id)));
    const result=await loadMdrFolderPage(data.client,"org","project","active","","Electrical",8);
    expect(result).toMatchObject({total:26,page:2,pageSize:25});
    expect(result.documents.map(row=>row.id)).toEqual(["00025"]);
    expect(data.reads[1].range).toEqual([25,25]);
  });
  it("fills the requested page when a server cap returns fewer than 25 rows",async()=>{
    const data=fixture(Array.from({length:7},(_,id)=>document(id)),{cap:2});
    const result=await loadMdrFolderPage(data.client,"org","project","active","","Electrical",1);
    expect(result.documents).toHaveLength(7);
    expect(data.reads.filter(read=>!read.head).map(read=>read.range?.[0])).toEqual([0,2,4,6]);
  });
  it("applies the same safe search to the count and document reads",async()=>{
    const data=fixture([document(1),{...document(2),document_type:"MTO"}]);
    const result=await loadMdrFolderPage(data.client,"org","project","active","%MTO,()","Electrical",1);
    expect(result.total).toBe(1);expect(result.documents.map(row=>row.id)).toEqual(["00002"]);
    expect(data.reads[0].or).toBe(data.reads[1].or);
    expect(data.reads[0].or).toContain("document_type.ilike.%MTO%");
  });
  it("returns an empty folder on page one when its final document was removed",async()=>{
    const data=fixture([]);
    expect(await loadMdrFolderPage(data.client,"org","project","active","","Electrical",3)).toEqual({documents:[],total:0,page:1,pageSize:25});
    expect(data.reads).toHaveLength(1);
  });
  it.each(["count failure","read failure","count drift","empty page","duplicate","wrong discipline"])("fails closed for %s",async problem=>{
    const data=fixture([document(1),document(2)],{cap:1,override:(read,index,result)=>{
      if(problem==="count failure"&&read.head)return {...result,count:null};
      if(read.head)return result;
      if(problem==="read failure")return {...result,error:{code:"failure"}};
      if(problem==="count drift")return {...result,count:3};
      if(problem==="empty page")return {...result,data:[]};
      if(problem==="duplicate"&&index===2)return {...result,data:[document(1)]};
      if(problem==="wrong discipline")return {...result,data:[document(1,"Process")]};
      return result;
    }});
    await expect(loadMdrFolderPage(data.client,"org","project","active","","Electrical",1)).rejects.toThrow();
    expect(loadDocumentSchedules).not.toHaveBeenCalled();
  });
  it("does not publish documents without their verified schedules",async()=>{
    vi.mocked(loadDocumentSchedules).mockRejectedValueOnce(new Error("schedule unavailable"));
    await expect(loadMdrFolderPage(fixture([document(1)]).client,"org","project","active","","Electrical",1)).rejects.toThrow();
    vi.mocked(loadDocumentSchedules).mockResolvedValueOnce(new Map());
    await expect(loadMdrFolderPage(fixture([document(1)]).client,"org","project","active","","Electrical",1)).rejects.toThrow();
  });
});

it("supports actual audited-preview transport for index paging, OR search and HEAD folder counts",async()=>{
  const rows=[document(0),document(1),document(2,"Process")];
  const rpc=vi.fn().mockResolvedValueOnce({data:{rows:rows.slice(0,2),total:3},error:null})
    .mockResolvedValueOnce({data:{rows:rows.slice(2),total:3},error:null})
    .mockResolvedValueOnce({data:{rows:rows.slice(0,2),total:2},error:null})
    .mockResolvedValueOnce({data:{rows:rows.slice(0,2).map(row=>({...row,document_revisions:[{state:"ready"}]})),total:2},error:null});
  const preview:AdminPreview={sessionId:"preview-session",organisationId:"org",projectId:"project",memberId:"member",role:"document_controller",displayName:"DCC",email:"dcc@example.test",disciplines:[],expiresAt:"2026-11-01T00:00:00Z"};
  const client=createMemberPreviewClient({rpc} as unknown as SupabaseClient,preview);
  expect((await loadMdrDisciplineIndex(client,"org","project","active","Electrical")).total).toBe(3);
  expect((await loadMdrFolderPage(client,"org","project","active","Electrical","Electrical",1)).documents).toHaveLength(2);
  expect(rpc).toHaveBeenCalledTimes(4);
  for(const [name,args] of rpc.mock.calls){
    expect(name).toBe("read_project_member_preview");
    expect(args).toMatchObject({target_preview:"preview-session",resource:"documents",query:{filters:expect.arrayContaining([
      {column:"organisation_id",op:"eq",not:false,value:"org"},{column:"project_id",op:"eq",not:false,value:"project"},{column:"lifecycle_status",op:"eq",not:false,value:"active"},
      {op:"or",filters:expect.arrayContaining([{column:"discipline",op:"ilike",not:false,value:"%Electrical%"},{column:"document_type",op:"ilike",not:false,value:"%Electrical%"}])},
    ])}});
  }
  expect(rpc.mock.calls[1][1].query.offset).toBe(2);
  expect(rpc.mock.calls[3][1].query).toMatchObject({offset:0,limit:2,embeds:["document_revisions"]});
});
