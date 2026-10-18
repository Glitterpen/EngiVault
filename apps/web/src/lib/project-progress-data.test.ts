// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {loadProjectProgressData} from "./project-progress-data";

vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>{throw new Error("A progress read must never use a privileged client");}}));

type Source="projects"|"project_document_progress"|"project_weekly_reports"|"project_issues";
type Result={data:unknown;error:unknown;count?:unknown};
type Call={method:string;args:unknown[]};
type Read={source:Source;calls:Call[]};
type Reader=(read:Read)=>Result|Promise<Result>;
const project={code:"PRJ-001",name:"Refinery FEED",delivery_stage:"feed",planned_start_date:"2026-10-01",planned_end_date:"2026-12-01"};
const delivery=(id="document-1")=>({document_id:id,document_number:`EL-${id}`,title:`Deliverable ${id}`,discipline:"Electrical",progress_weight:1,progress_credit:33,uploaded:true,overdue:false,issue_status:"Issued for Review (IFR)",planned_submission_date:"2026-10-20",planned_final_date:"2026-11-20",delivery_stage:"feed",terminal_issue_status:"Issued for Design (IFD)",revision_id:"revision-1",revision_code:"R01",issue_date:"2026-10-15",next_submission_date:"2026-10-20",last_issue_date:"2026-10-15",revision_cycle_days:3,deadline_kind:"next_revision"});
const report=(id="report-1")=>({id,period_end:"2026-10-11",generated_at:"2026-10-12T10:00:00Z",snapshot:{overview:{completion:20}}});
const issue=(id="issue-1")=>({id,severity:"high",status:"open"});
const observation={version:1,captured_at:"2026-10-15T12:00:00Z",submitted_progress:67,accepted_progress:33,total_deliverables:1,total_weight:1};
const sources:Source[]=["project_document_progress","project_weekly_reports","project_issues"];
let reads:Read[],reader:Reader;
const rpc=vi.fn(),mutation=vi.fn();

function defaultRead(read:Read):Result{
  const data=read.source==="projects"?project:read.source==="project_document_progress"?[delivery()]:read.source==="project_weekly_reports"?[report()]:[issue()];
  return {data,error:null,count:Array.isArray(data)?data.length:undefined};
}
function query(source:Source){
  const read:Read={source,calls:[]};reads.push(read);
  const chain={
    select(...args:unknown[]){read.calls.push({method:"select",args});return chain;},
    eq(...args:unknown[]){read.calls.push({method:"eq",args});return chain;},
    neq(...args:unknown[]){read.calls.push({method:"neq",args});return chain;},
    order(...args:unknown[]){read.calls.push({method:"order",args});return chain;},
    range(...args:unknown[]){read.calls.push({method:"range",args});return chain;},
    single(){read.calls.push({method:"single",args:[]});return Promise.resolve().then(()=>reader(read));},
    insert:mutation,update:mutation,delete:mutation,upsert:mutation,
    then(resolve:(value:Result)=>unknown,reject?:(reason:unknown)=>unknown){return Promise.resolve().then(()=>reader(read)).then(resolve,reject);},
  };
  return chain;
}
const from=vi.fn((source:Source)=>query(source));
const client={from,rpc} as unknown as SupabaseClient;
const load=(includeHistory=true)=>loadProjectProgressData(client,"org","project",{includeHistory});
const offset=(read:Read)=>read.calls.find(call=>call.method==="range")?.args[0] as number;
const key=(source:Source)=>source==="project_document_progress"?"rows":source==="project_weekly_reports"?"reports":"issues";
const row=(source:Source,id:string)=>source==="project_document_progress"?delivery(id):source==="project_weekly_reports"?report(id):issue(id);
beforeEach(()=>{vi.clearAllMocks();reads=[];reader=defaultRead;mutation.mockImplementation(()=>{throw new Error("Unexpected mutation");});rpc.mockResolvedValue({data:observation,error:null});});
afterEach(()=>vi.restoreAllMocks());

it("loads current project, active deliveries, persisted report snapshots and open issues without inventing history",async()=>{
  const result=await load();
  expect(result.project).toEqual(project);
  expect(result.rows).toEqual([delivery()]);
  expect(result.reports).toEqual([report()]);
  expect(result.issues).toEqual([expect.objectContaining({severity:"high",status:"open"})]);
  expect(result.submissionProgress).toEqual(observation);
  expect(mutation).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledWith("get_project_submission_progress",{target_organisation:"org",target_project:"project"});
  expect(rpc).toHaveBeenCalledWith("get_project_milestone_baseline",{target_organisation:"org",target_project:"project"});
  expect(result.baseline).toBeNull();
});

it("scopes every read to this organisation and exact project and requests explicit bounded selections",async()=>{
  await load();
  expect(reads.map(read=>read.source).sort()).toEqual(["projects",...sources].sort());
  for(const read of reads){
    expect(read.calls).toContainEqual({method:"eq",args:["organisation_id","org"]});
    expect(read.calls).toContainEqual({method:"eq",args:[read.source==="projects"?"id":"project_id","project"]});
    const selection=read.calls.find(call=>call.method==="select")!;
    expect(typeof selection.args[0]).toBe("string");
    expect(selection.args[0]).not.toContain("*");
    if(read.source!=="projects"){
      expect(selection.args[1]).toEqual({count:"exact"});
      expect(read.calls).toContainEqual({method:"range",args:[0,499]});
      expect(read.calls.filter(call=>call.method==="order").map(call=>call.args[0])).toContain(read.source==="project_document_progress"?"document_id":"id");
    }
  }
  expect(reads.find(read=>read.source==="projects")?.calls).toContainEqual({method:"single",args:[]});
  expect(reads.find(read=>read.source==="project_document_progress")?.calls).toContainEqual({method:"eq",args:["lifecycle_status","active"]});
  expect(reads.find(read=>read.source==="project_issues")?.calls).toContainEqual({method:"neq",args:["status","resolved"]});
  const reportSelect=reads.find(read=>read.source==="project_weekly_reports")!.calls.find(call=>call.method==="select")!.args[0] as string;
  expect(reportSelect.split(",").map(part=>part.trim()).sort()).toEqual(["id","period_end","generated_at","snapshot"].sort());
});

it("does not query report snapshots or manufacture an empty history when history is not authorised",async()=>{
  const result=await load(false);
  expect(result.reports).toBeNull();
  expect(result.submissionProgress).toBeNull();expect(rpc).toHaveBeenCalledExactlyOnceWith("get_project_milestone_baseline",{target_organisation:"org",target_project:"project"});
  expect(from).not.toHaveBeenCalledWith("project_weekly_reports");
  expect(result.rows).toEqual([delivery()]);expect(result.issues).not.toBeNull();
});

it("loads sanitised daily aggregate observations without requiring a generated PDF",async()=>{
  const daily={id:"daily-1",period_end:"2026-10-14",generated_at:"2026-10-14T06:05:00Z",source_kind:"snapshot",snapshot:{delivery_progress_comparison:{...observation,captured_at:"2026-10-14T06:05:00Z",secret:"must not leak"},storage_key:"private/path"}};
  rpc.mockImplementation(async name=>({data:name==="get_project_progress_observations"?[daily]:observation,error:null}));
  const result=await load();
  expect(result.observations).toEqual([{id:"daily-1",period_end:"2026-10-14",generated_at:"2026-10-14T06:05:00Z",source_kind:"snapshot",snapshot:{summary:{overall_progress:33},delivery_progress_comparison:{...observation,captured_at:"2026-10-14T06:05:00Z"}}}]);
  expect(JSON.stringify(result.observations)).not.toMatch(/must not leak|private\/path/);
  expect(mutation).not.toHaveBeenCalled();
});

it("does not discard saved reports or live actuals when daily history fails",async()=>{
  rpc.mockImplementation(async name=>name==="get_project_progress_observations"?{data:null,error:{code:"XX000"}}:{data:observation,error:null});
  const result=await load();
  expect(result.observations).toBeNull();expect(result.reports).toEqual([report()]);expect(result.submissionProgress).toEqual(observation);
});

describe("restricted submitted-progress aggregate",()=>{
  it("never queries raw revisions and discards unexpected fields at the read boundary",async()=>{
    rpc.mockResolvedValue({data:{...observation,secret:"TOP_SECRET",revisions:[{storage_key:"private/file"}]},error:null});
    const result=await load();
    expect(result.submissionProgress).toEqual(observation);expect(from).not.toHaveBeenCalledWith("document_revisions");
    expect(JSON.stringify(result)).not.toContain("TOP_SECRET");expect(JSON.stringify(result)).not.toContain("private/file");
  });
  it.each([null,[],false,{...observation,version:2},{...observation,captured_at:"invalid"},{...observation,submitted_progress:"67"},{...observation,submitted_progress:101},{...observation,submitted_progress:NaN},{...observation,accepted_progress:68},{...observation,accepted_progress:-1},{...observation,total_deliverables:1.5},{...observation,total_deliverables:-1},{...observation,total_weight:-1},{...observation,total_weight:Infinity}])("does not turn a malformed aggregate %j into a zero",async data=>{
    rpc.mockResolvedValue({data,error:null});
    const result=await load();expect(result.submissionProgress).toBeNull();expect(result.rows).toEqual([delivery()]);expect(result.reports).toEqual([report()]);
  });
  it("isolates a denied aggregate without leaking diagnostics or falling back to revision reads",async()=>{
    rpc.mockResolvedValue({data:observation,error:{message:"TOP_SECRET provider diagnostics"}});
    const result=await load();expect(result.submissionProgress).toBeNull();expect(result.rows).toEqual([delivery()]);
    expect(JSON.stringify(result)).not.toContain("TOP_SECRET");expect(from).not.toHaveBeenCalledWith("document_revisions");
  });
  it("isolates an aggregate transport exception",async()=>{
    rpc.mockRejectedValue(new Error("offline"));expect((await load()).submissionProgress).toBeNull();
  });
  it("preserves a genuine zero-scope aggregate",async()=>{
    rpc.mockResolvedValue({data:{...observation,submitted_progress:0,accepted_progress:0,total_deliverables:0,total_weight:0},error:null});
    expect((await load()).submissionProgress).toMatchObject({submitted_progress:0,total_deliverables:0});
  });
});

it("starts independent source reads in parallel rather than waiting for a project response",async()=>{
  const pending=new Map<Source,(result:Result)=>void>();
  reader=read=>new Promise<Result>(resolve=>pending.set(read.source,resolve));
  const result=load();
  for(let turn=0;turn<10&&pending.size<4;turn++)await Promise.resolve();
  expect([...pending.keys()].sort()).toEqual(["projects",...sources].sort());
  for(const [source,resolve] of pending)resolve(defaultRead({source,calls:[]}));
  await expect(result).resolves.toMatchObject({project});
});

it.each(sources)("loads every %s row beyond a 500-row response boundary",async source=>{
  reader=read=>read.source===source?{data:offset(read)===0?Array.from({length:500},(_,index)=>row(source,String(index))):[row(source,"500")],error:null,count:501}:defaultRead(read);
  const result=await load();
  expect(result[key(source)]).toHaveLength(501);
  const pages=reads.filter(read=>read.source===source);
  expect(pages.map(offset)).toEqual([0,500]);
  for(const page of pages){
    const [start,end]=page.calls.find(call=>call.method==="range")!.args as number[];
    expect(end).toBeGreaterThanOrEqual(start);expect(end).toBeLessThanOrEqual(start+499);
  }
});

it.each(sources)("advances %s pagination by actual rows when the server caps below 500",async source=>{
  reader=read=>read.source===source?{data:offset(read)===0?[row(source,"first"),row(source,"second")]:[row(source,"third")],error:null,count:3}:defaultRead(read);
  const result=await load();
  expect(result[key(source)]).toHaveLength(3);
  expect(reads.filter(read=>read.source===source).map(offset)).toEqual([0,2]);
});

it.each(sources)("preserves a genuine empty %s source instead of treating zero as an outage",async source=>{
  reader=read=>read.source===source?{data:[],error:null,count:0}:defaultRead(read);
  const result=await load();
  expect(result[key(source)]).toEqual([]);
  expect(reads.filter(read=>read.source===source)).toHaveLength(1);
});

it.each([null,{code:"XX000",message:"TOP_SECRET_API_KEY provider diagnostics"}])("marks a missing or failed project unavailable: %j",async error=>{
  const diagnostics=vi.spyOn(console,"error").mockImplementation(()=>{});
  reader=read=>read.source==="projects"?{data:error?project:null,error}:defaultRead(read);
  const result=await load();
  expect(result.project).toBeNull();
  expect(result.rows).not.toBeNull();
  expect(JSON.stringify(result)).not.toContain("TOP_SECRET_API_KEY");
  expect(JSON.stringify(diagnostics.mock.calls)).not.toContain("TOP_SECRET_API_KEY");
});

it("isolates a rejected project transport without failing independent current reads",async()=>{
  reader=read=>read.source==="projects"?Promise.reject(new Error("Project connection unavailable")):defaultRead(read);
  const result=await load();
  expect(result.project).toBeNull();expect(result.rows).toEqual([delivery()]);
});

it("allows exactly 50,000 visible deliveries without truncating the final page",async()=>{
  reader=read=>read.source==="project_document_progress"?{data:Array.from({length:500},(_,index)=>delivery(String(offset(read)+index))),error:null,count:50_000}:defaultRead(read);
  const result=await load();
  expect(result.rows).toHaveLength(50_000);
  const pages=reads.filter(read=>read.source==="project_document_progress");
  expect(pages).toHaveLength(100);expect(offset(pages[99])).toBe(49_500);
});

it.each(sources)("isolates a failed %s read without disclosing diagnostics or discarding independent successful data",async source=>{
  const logs=[vi.spyOn(console,"error").mockImplementation(()=>{}),vi.spyOn(console,"warn").mockImplementation(()=>{}),vi.spyOn(console,"log").mockImplementation(()=>{})];
  reader=read=>read.source===source?{data:[row(source,"stale")],error:{code:"XX000",message:"TOP_SECRET_API_KEY provider diagnostics"},count:1}:defaultRead(read);
  const result=await load();
  expect(result[key(source)]).toBeNull();expect(result.project).toEqual(project);
  for(const other of sources.filter(item=>item!==source))expect(result[key(other)]).not.toBeNull();
  expect(JSON.stringify(result)).not.toContain("TOP_SECRET_API_KEY");
  expect(JSON.stringify(logs.flatMap(log=>log.mock.calls))).not.toContain("TOP_SECRET_API_KEY");
});

it.each(sources)("isolates a rejected %s transport read as unavailable",async source=>{
  reader=read=>read.source===source?Promise.reject(new Error("Transport connection lost")):defaultRead(read);
  const result=await load();
  expect(result[key(source)]).toBeNull();expect(result.project).toEqual(project);
});

describe.each(sources)("complete %s snapshots",source=>{
  it.each([undefined,null,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,"1"])("rejects missing or invalid exact count %j",async count=>{
    reader=read=>read.source===source?{data:[row(source,"one")],error:null,count}:defaultRead(read);
    expect((await load())[key(source)]).toBeNull();
  });
  it.each([null,{},"not rows"])("rejects malformed rows %j rather than pretending they are an empty success",async data=>{
    reader=read=>read.source===source?{data,error:null,count:0}:defaultRead(read);
    expect((await load())[key(source)]).toBeNull();
  });
  it("rejects counts above the 50,000-row safety boundary without continuing indefinitely",async()=>{
    reader=read=>read.source===source?{data:[],error:null,count:50_001}:defaultRead(read);
    expect((await load())[key(source)]).toBeNull();
    expect(reads.filter(read=>read.source===source)).toHaveLength(1);
  });
  it("rejects a response page larger than the requested 500 rows",async()=>{
    reader=read=>read.source===source?{data:Array.from({length:501},(_,index)=>row(source,String(index))),error:null,count:501}:defaultRead(read);
    expect((await load())[key(source)]).toBeNull();
  });
  it("rejects rows exceeding the declared exact count",async()=>{
    reader=read=>read.source===source?{data:[row(source,"one"),row(source,"two")],error:null,count:1}:defaultRead(read);
    expect((await load())[key(source)]).toBeNull();
  });
  it("rejects duplicate identities in one page",async()=>{
    reader=read=>read.source===source?{data:[row(source,"same"),row(source,"same")],error:null,count:2}:defaultRead(read);
    expect((await load())[key(source)]).toBeNull();
  });
  it("rejects duplicate identities across page boundaries",async()=>{
    reader=read=>read.source===source?{data:[row(source,"same")],error:null,count:2}:defaultRead(read);
    expect((await load())[key(source)]).toBeNull();
    expect(reads.filter(read=>read.source===source)).toHaveLength(2);
  });
  it("rejects count drift between pages instead of combining different scopes",async()=>{
    reader=read=>read.source===source?{data:[row(source,String(offset(read)))],error:null,count:offset(read)===0?2:3}:defaultRead(read);
    expect((await load())[key(source)]).toBeNull();
  });
  it("rejects an empty early page while exact count still promises remaining rows",async()=>{
    reader=read=>read.source===source?{data:offset(read)===0?[row(source,"first")]:[],error:null,count:2}:defaultRead(read);
    expect((await load())[key(source)]).toBeNull();
  });
  it("discards all earlier rows if a later page fails",async()=>{
    reader=read=>read.source===source?offset(read)===0?{data:[row(source,"first")],error:null,count:2}:{data:null,error:{code:"OFFLINE"},count:null}:defaultRead(read);
    expect((await load())[key(source)]).toBeNull();
  });
  it.each([null,false,"invalid row"])("rejects an invalid row value %j without rejecting the whole load",async invalid=>{
    reader=read=>read.source===source?{data:[invalid],error:null,count:1}:defaultRead(read);
    expect((await load())[key(source)]).toBeNull();
  });
  it.each(["",null,17])("rejects an invalid row identity %j",async identity=>{
    const invalid={...row(source,"valid"),[source==="project_document_progress"?"document_id":"id"]:identity};
    reader=read=>read.source===source?{data:[invalid],error:null,count:1}:defaultRead(read);
    expect((await load())[key(source)]).toBeNull();
  });
});
