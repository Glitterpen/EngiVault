// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createMdrRegisterCsv,loadMdrRegisterExport} from "./mdr-register-export";
import {loadMdrDisciplineIndex,loadMdrFolderPage} from "@/lib/mdr-register-data";
import type {MdrDocument,MdrDisciplineSummary} from "@/lib/mdr-register-types";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/mdr-register-data",()=>({loadMdrDisciplineIndex:vi.fn(),loadMdrFolderPage:vi.fn()}));

const client={from:vi.fn(),rpc:vi.fn(),storage:{from:vi.fn()}} as unknown as SupabaseClient;
function document(id:number,discipline="Electrical",records="active"):MdrDocument{
  return {id:String(id),document_number:`DOC-${id}`,title:`Deliverable ${id}`,document_type:"Drawing",discipline,status:"draft",area:null,system:null,work_package:null,
    planned_submission_date:"2026-10-01",updated_at:"2026-10-15T10:00:00Z",lifecycle_status:records,document_revisions:[],
    schedule:{document_id:String(id),planned_submission_date:"2026-10-01",next_submission_date:"2026-10-19",last_issue_date:"2026-10-14",revision_cycle_days:3,deadline_kind:"next_revision",overdue:false}};
}
function pagedFixture(rows:MdrDocument[]){
  const counts=new Map<string,number>();
  for(const row of rows)counts.set(row.discipline,(counts.get(row.discipline)??0)+1);
  vi.mocked(loadMdrDisciplineIndex).mockResolvedValue({total:rows.length,disciplines:[...counts].map(([name,count])=>({name,count}))});
  vi.mocked(loadMdrFolderPage).mockImplementation(async(_client,_org,_project,_records,_q,discipline,page)=>{
    const matches=rows.filter(row=>row.discipline===discipline);
    return {documents:matches.slice((page-1)*25,page*25),total:matches.length,page,pageSize:25};
  });
}
beforeEach(()=>{vi.clearAllMocks();pagedFixture([]);});

describe("complete member-scoped register export",()=>{
  it("downloads every discipline and every page, not just the expanded or searched folder",async()=>{
    const rows=[...Array.from({length:28},(_,index)=>document(index)),...Array.from({length:3},(_,index)=>document(index+28,"Process"))];
    pagedFixture(rows);
    expect(await loadMdrRegisterExport(client,"org","project","active")).toEqual(rows);
    expect(loadMdrDisciplineIndex).toHaveBeenCalledTimes(2);
    for(const call of vi.mocked(loadMdrDisciplineIndex).mock.calls)expect(call).toEqual([client,"org","project","active",""]);
    expect(vi.mocked(loadMdrFolderPage).mock.calls.map(call=>call.slice(1))).toEqual([
      ["org","project","active","","Electrical",1],["org","project","active","","Electrical",2],["org","project","active","","Process",1],
    ]);
    expect(client.from).not.toHaveBeenCalled();expect(client.rpc).not.toHaveBeenCalled();expect(client.storage.from).not.toHaveBeenCalled();
  });
  it("keeps removed documents separate and uses the exact supplied preview client",async()=>{
    const preview={from:vi.fn()} as unknown as SupabaseClient;
    const rows=[document(1,"Civil","archived")];pagedFixture(rows);
    expect(await loadMdrRegisterExport(preview,"tenant-A","project-A","archived")).toEqual(rows);
    expect(loadMdrFolderPage).toHaveBeenCalledExactlyOnceWith(preview,"tenant-A","project-A","archived","","Civil",1);
  });
  it("returns a genuine empty register without folder queries",async()=>{
    expect(await loadMdrRegisterExport(client,"org","project","active")).toEqual([]);
    expect(loadMdrDisciplineIndex).toHaveBeenCalledTimes(2);
    expect(loadMdrFolderPage).not.toHaveBeenCalled();
  });
  it("rejects a first discipline appearing after the initially empty index",async()=>{
    vi.mocked(loadMdrDisciplineIndex).mockResolvedValueOnce({total:0,disciplines:[]}).mockResolvedValueOnce({total:1,disciplines:[{name:"Process",count:1}]});
    await expect(loadMdrRegisterExport(client,"org","project","active")).rejects.toThrow("MDR download");
    expect(loadMdrFolderPage).not.toHaveBeenCalled();
  });
  it.each([
    {total:100001,disciplines:[{name:"Electrical",count:100001}]},
    {total:-1,disciplines:[]},
    {total:NaN,disciplines:[]},
    {total:2,disciplines:[{name:"Electrical",count:1}]},
    {total:2,disciplines:[{name:"Electrical",count:1},{name:"Electrical",count:1}]},
    {total:0,disciplines:[{name:"Electrical",count:0}]},
    {total:1,disciplines:[{name:" ",count:1}]},
  ])("rejects invalid/unbounded index %# without downloading partial data",async index=>{
    vi.mocked(loadMdrDisciplineIndex).mockResolvedValue(index);
    await expect(loadMdrRegisterExport(client,"org","project","active")).rejects.toThrow("MDR download");
    expect(loadMdrFolderPage).not.toHaveBeenCalled();
  });
  it.each(["count drift","truncated page","duplicate between pages","clamped page","wrong page size","missing schedule","wrong discipline","wrong lifecycle"])("fails closed on %s",async problem=>{
    const rows=Array.from({length:26},(_,id)=>document(id));pagedFixture(rows);
    vi.mocked(loadMdrFolderPage).mockImplementation(async(_client,_org,_project,_records,_q,_discipline,page)=>{
      const result={documents:rows.slice((page-1)*25,page*25),total:26,page,pageSize:25};
      if(page===2){
        if(problem==="count drift")result.total=25;
        if(problem==="truncated page")result.documents=[];
        if(problem==="duplicate between pages")result.documents=[rows[0]];
        if(problem==="clamped page")result.page=1;
        if(problem==="wrong page size")result.pageSize=50;
        if(problem==="missing schedule")result.documents=[{...rows[25],schedule:undefined} as unknown as MdrDocument];
        if(problem==="wrong discipline")result.documents=[{...rows[25],discipline:"Process"}];
        if(problem==="wrong lifecycle")result.documents=[{...rows[25],lifecycle_status:"archived"}];
      }
      return result;
    });
    await expect(loadMdrRegisterExport(client,"org","project","active")).rejects.toThrow("MDR download");
  });
  it("rejects duplicate document identifiers between different folders",async()=>{
    pagedFixture([document(1),document(1,"Process")]);
    await expect(loadMdrRegisterExport(client,"org","project","active")).rejects.toThrow("MDR download");
  });
  it("rejects folder failure instead of returning the already read folders",async()=>{
    const disciplines:MdrDisciplineSummary[]=[{name:"Electrical",count:1},{name:"Process",count:1}];
    vi.mocked(loadMdrDisciplineIndex).mockResolvedValue({total:2,disciplines});
    vi.mocked(loadMdrFolderPage).mockResolvedValueOnce({documents:[document(1)],total:1,page:1,pageSize:25}).mockRejectedValueOnce(new Error("backend unavailable"));
    await expect(loadMdrRegisterExport(client,"org","project","active")).rejects.toThrow();
  });
  it.each([
    {total:2,disciplines:[{name:"Electrical",count:1},{name:"Process",count:1}]},
    {total:1,disciplines:[{name:"Process",count:1}]},
  ])("rejects a changed final discipline index rather than silently omitting records %#",async verified=>{
    pagedFixture([document(1)]);
    vi.mocked(loadMdrDisciplineIndex).mockResolvedValueOnce({total:1,disciplines:[{name:"Electrical",count:1}]}).mockResolvedValueOnce(verified);
    await expect(loadMdrRegisterExport(client,"org","project","active")).rejects.toThrow("MDR download");
  });
});

describe("Excel-compatible CSV",()=>{
  it("includes UTF-8 BOM, quoted headers, CRLF rows and latest actual submission details",()=>{
    const row=document(1,"Électrical");
    row.area="A-01";row.system="Utility";row.work_package="WP-1";
    row.document_revisions=[
      {id:"a",state:"ready",revision_code:"R01",issue_status:"Issued for Review (IFR)",created_at:"2026-10-12T10:00:00Z",control_status:"accepted"},
      {id:"b",state:"ready",revision_code:"A01",issue_status:"Issued for Approval (IFA)",created_at:"2026-10-15T10:00:00Z",control_status:"submitted"},
      {id:"c",state:"pending_upload",revision_code:"IFD",issue_status:"Issued for Design (IFD)",created_at:"2026-10-16T10:00:00Z",control_status:"submitted"},
    ];
    const csv=createMdrRegisterCsv([row]);
    expect(csv.startsWith('\uFEFF"Document number","Title","Discipline"')).toBe(true);
    expect(csv).toContain('"A01","IFA","Issued for Approval (IFA)","2026-10-15T10:00:00Z","submitted"');
    expect(csv).toContain('"2026-10-01","2026-10-14","2026-10-19","3","No","active","A-01","Utility","WP-1"');
    expect(csv).not.toContain('"draft"');expect(csv).not.toContain('"IFD"');expect(csv).toContain('"Électrical"');
    expect(csv.match(/\r\n/g)).toHaveLength(2);expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("preserves commas, quotes and newlines within quoted cells",()=>{
    const row={...document(1),title:'P&ID, "Phase 1"\r\nSecond line'};
    expect(createMdrRegisterCsv([row])).toContain('"P&ID, ""Phase 1""\r\nSecond line"');
  });
  it.each(["=1+1","+cmd","-1+2","@SUM(A1:A2)","  =HYPERLINK(1)","\t=1","\r\n+2","\u200B@SUM(1)","\uFEFF=2","\tordinary text"])("neutralizes dangerous spreadsheet cell %j",title=>{
    expect(createMdrRegisterCsv([{...document(1),title}])).toContain(`"'${title.replaceAll('"','""')}"`);
  });
  it("protects all columns rather than only document titles",()=>{
    const row={...document(1),document_number:"=1",discipline:"+Electrical",document_type:"-Drawing",area:"@Area",system:" =System",work_package:"\tPackage"};
    const csv=createMdrRegisterCsv([row]);
    for(const value of [row.document_number,row.discipline,row.document_type,row.area,row.system,row.work_package])expect(csv).toContain(`"'${value}"`);
  });
  it("leaves status as Not submitted rather than implying draft is an actual submitted issue",()=>{
    const csv=createMdrRegisterCsv([document(1)]);
    expect(csv).toContain('"","","Not submitted","",""');
    expect(csv).not.toContain("draft");
  });
  it("exports a header-only file for a real empty register",()=>{
    const csv=createMdrRegisterCsv([]);expect(csv.split("\r\n")).toHaveLength(2);expect(csv.startsWith("\uFEFF")).toBe(true);
  });
});
