// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import type {ReactNode} from "react";
import NewTransmittalPage from "./page";
import {requireProject} from "@/lib/auth";
import {TransmittalCreateForm} from "@/components/transmittal-create-form";

vi.mock("server-only",()=>({}));
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn((href:string)=>{throw new Error(`redirect:${href}`);})}));
vi.mock("@/components/help-tip",()=>({HelpTip:()=>null}));
vi.mock("@/components/transmittal-create-form",()=>({TransmittalCreateForm:vi.fn(()=> <div data-testid="transmittal-form"/>)}));

const organisationId="a0000000-0000-4000-8000-000000000001";
const projectId="b0000000-0000-4000-8000-000000000001";
const base=`/app/${organisationId}/projects/${projectId}`;
type Result={data:unknown;error:unknown;count:number|null};
let results:Record<string,Result>;
let role:string;
let preview:unknown;
let throwReads:number;
let pageChunk:number;
let markup:string;
const from=vi.fn();
const rpc=vi.fn();
const queries=new Map<string,ReturnType<typeof query>[]>();
const render=(element:ReactNode)=>{markup=renderToStaticMarkup(element);};

function query(result:Result){
  const builder={
    select:vi.fn(()=>builder),
    eq:vi.fn((...args:unknown[])=>{void args;return builder;}),
    in:vi.fn(()=>builder),
    order:vi.fn(()=>builder),
    range:vi.fn(async(start:number,end:number)=>({...result,data:Array.isArray(result.data)?result.data.slice(start,Math.min(end+1,start+pageChunk)):result.data})),
    single:vi.fn(async()=>result),
    then:<TResult1=Result,TResult2=never>(
      fulfilled?:((value:Result)=>TResult1|PromiseLike<TResult1>)|null,
      rejected?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null,
    )=>Promise.resolve(result).then(fulfilled,rejected),
  };
  return builder;
}

function revision(id:string,documentId=id,state="ready",created_at="2026-10-15T08:00:00Z",arrayEmbed=false){
  const document={id:documentId,document_number:`DOC-${documentId}`,title:`Engineering document ${documentId}`,discipline:"Process",document_type:"Drawing",lifecycle_status:"active"};
  return {id,revision_code:"R01",issue_status:"Issued for Review (IFR)",state,created_at,documents:arrayEmbed?[document]:document};
}
function issue(id:string,state="ready",kind="document_transmittal",arrayEmbed=false){
  const pack={id:`package-${id}`,state,package_number:`TR-${id}`,manifest:{kind},created_at:"2026-10-14T08:00:00Z"};
  return {revision_id:id,document_id:`document-${id}`,document_number:`DOC-${id}`,revision_code:"R01",discipline:"Process",issue_status:"Issued for Review (IFR)",work_packages:arrayEmbed?[pack]:pack};
}
const page=()=>NewTransmittalPage({params:Promise.resolve({organisationId,projectId})});
const formProps=()=>vi.mocked(TransmittalCreateForm).mock.calls.at(-1)![0];

beforeEach(()=>{
  vi.clearAllMocks();
  queries.clear();
  role="document_controller";
  preview=null;
  throwReads=0;
  pageChunk=500;
  markup="";
  results={
    projects:{data:{code:"FEED-01",name:"Engineering project",client_name:"  Controlled Client Ltd  "},error:null,count:null},
    document_revisions:{data:[revision("ready"),revision("old","replaced","ready"),revision("latest","replaced","processing","2026-10-16T08:00:00Z",true)],error:null,count:3},
    work_package_items:{data:[issue("transmitted"),issue("staged","failed","document_transmittal",true)],error:null,count:2},
    work_packages:{data:null,error:null,count:12},
  };
  from.mockImplementation((table:string)=>{
    if(throwReads>0){throwReads--;throw new Error("private provider connection detail");}
    const builder=query(results[table]);
    queries.set(table,[...(queries.get(table)??[]),builder]);
    return builder;
  });
  vi.mocked(requireProject).mockImplementation(async()=>({supabase:{from,rpc},access:{role},preview} as never));
});

it("keeps every read tenant-scoped and never performs a mutation while loading",async()=>{
  render(await page());
  expect(requireProject).toHaveBeenCalledWith(organisationId,projectId);
  for(const builders of queries.values())for(const builder of builders){
    expect(builder.eq).toHaveBeenCalledWith("organisation_id",organisationId);
  }
  expect(queries.get("projects")?.[0].eq).toHaveBeenCalledWith("id",projectId);
  for(const table of ["document_revisions","work_package_items","work_packages"]){
    expect(queries.get(table)?.[0].eq).toHaveBeenCalledWith("project_id",projectId);
  }
  expect(rpc).not.toHaveBeenCalled();
});

it("keeps accepted active-MDR and security-preparation filters without weakening eligibility",async()=>{
  render(await page());
  const builder=queries.get("document_revisions")![0];
  expect(builder.eq).toHaveBeenCalledWith("control_status","accepted");
  expect(builder.eq).toHaveBeenCalledWith("documents.lifecycle_status","active");
  expect(builder.in).toHaveBeenCalledWith("state",["quarantined","processing","ready","failed"]);
  expect(builder.order).toHaveBeenCalledWith("id");
  expect(builder.range).toHaveBeenCalledWith(0,499);
});

it("reads complete included history without an embedded JSON manifest filter",async()=>{
  pageChunk=1;
  render(await page());
  const builders=queries.get("work_package_items")!;
  expect(builders.map(builder=>builder.range.mock.calls[0][0])).toEqual([0,1]);
  for(const builder of builders){
    expect(builder.eq).toHaveBeenCalledWith("inclusion_state","included");
    expect(builder.eq.mock.calls.map(([column])=>column)).not.toContain("work_packages.manifest->>kind");
  }
  expect(formProps().history).toHaveLength(2);
  expect(formProps().issuedRevisionNumbers).toEqual({transmitted:["TR-TRANSMITTED"],staged:["TR-STAGED"]});
});

it("passes only the latest accepted revision per document and keeps preparing replacements separate",async()=>{
  render(await page());
  expect(formProps().revisions.map(row=>row.id)).toEqual(["ready"]);
  expect(formProps().preparing.map(row=>row.id)).toEqual(["latest"]);
  expect(formProps().preparing[0].state).toBe("processing");
  expect(formProps().revisions.some(row=>row.id==="old")).toBe(false);
});

it("supports object and array document embeds and excludes missing embedded documents",async()=>{
  results.document_revisions={data:[revision("object"),revision("array","array","ready",undefined,true),{...revision("missing"),documents:[]}],count:3,error:null};
  render(await page());
  expect(formProps().revisions.map(row=>row.id)).toEqual(["array","object"]);
});

it.each(["quarantined","processing","failed"])("does not replace a latest %s acceptance with an older ready file",async(state)=>{
  results.document_revisions={data:[revision("older","document","ready"),revision("newer","document",state,"2026-10-16T09:00:00Z")],count:2,error:null};
  render(await page());
  expect(formProps().revisions).toEqual([]);
  expect(formProps().preparing.map(row=>row.id)).toEqual(["newer"]);
});

it("filters issue history by transmittal kind and ignores missing revision/package embeds",async()=>{
  results.work_package_items={data:[issue("transmittal"),issue("frozen","ready","frozen_package"),{...issue("no-revision"),revision_id:null},{...issue("no-pack"),work_packages:[]}],count:4,error:null};
  render(await page());
  expect(formProps().history.map(row=>row.revisionId)).toEqual(["transmittal"]);
  expect(formProps().issuedRevisionNumbers).toEqual({transmittal:["TR-TRANSMITTAL"]});
});

it.each(["frozen","building","failed","cancelled","ready"])("retains %s transmittals in reserved issue history",async(state)=>{
  results.work_package_items={data:[issue("reserved",state)],count:1,error:null};
  render(await page());
  expect(formProps().history[0]).toMatchObject({revisionId:"reserved",packageState:state});
  expect(formProps().issuedRevisionNumbers).toEqual({reserved:["TR-RESERVED"]});
});

it("uses controlled trimmed client information and package count for the suggested number",async()=>{
  render(await page());
  expect(formProps()).toMatchObject({organisationId,projectId,clientName:"Controlled Client Ltd",defaultNumber:`TR-FEED-01-${new Date().getFullYear()}-013`,readOnly:false});
});

it("explicitly passes read-only preview state while retaining member-scoped queue and history data",async()=>{
  preview={sessionId:"audited-session",role:"document_controller"};
  render(await page());
  expect(formProps()).toMatchObject({organisationId,projectId,readOnly:true});
  expect(formProps().preparing.map(row=>row.id)).toEqual(["latest"]);
  expect(formProps().history).toHaveLength(2);
  expect(rpc).not.toHaveBeenCalled();
});

it("retains missing client information as null rather than inventing an editable recipient",async()=>{
  results.projects.data={code:"FEED-01",client_name:"   "};
  render(await page());
  expect(formProps().clientName).toBeNull();
});

it("renders genuinely empty successful data without implying a load failure",async()=>{
  results.document_revisions={data:[],count:0,error:null};
  results.work_package_items={data:[],count:0,error:null};
  results.work_packages.count=0;
  render(await page());
  expect(formProps()).toMatchObject({revisions:[],preparing:[],history:[],issuedRevisionNumbers:{},defaultNumber:`TR-FEED-01-${new Date().getFullYear()}-001`});
  expect(markup).not.toContain("Transmittal list could not be refreshed");
});

it("retries a thrown transport read once and still uses complete successful data",async()=>{
  throwReads=1;
  render(await page());
  expect(markup).toContain('data-testid="transmittal-form"');
  expect(formProps().history).toHaveLength(2);
});

it.each(["projects","document_revisions","work_package_items","work_packages"])("fails closed with a safe retry when %s is unavailable",async(table)=>{
  results[table]={data:null,count:null,error:{message:"supabase private_package credential=hidden-test-detail"}};
  render(await page());
  expect(markup).toMatch(/<h1[^>]*>Transmittal list could not be refreshed<\/h1>/);
  expect(markup).not.toContain('data-testid="transmittal-form"');
  expect(markup).toContain(`href="${base}/work-packages/transmittals/new"`);
  expect(markup).toContain("Retry securely");
  expect(markup).toContain(`href="${base}/work-packages"`);
  expect(markup).toContain("Check work packages");
  expect(markup).not.toMatch(/supabase|private_package|hidden-test-detail/);
});

it("never renders a selection form when repeated transport reads throw",async()=>{
  throwReads=2;
  render(await page());
  expect(markup).toMatch(/<h1[^>]*>Transmittal list could not be refreshed<\/h1>/);
  expect(TransmittalCreateForm).not.toHaveBeenCalled();
  expect(markup).not.toContain("private provider connection detail");
});

it.each([
  ["engineer","assignments"],
  ["project_admin","overview"],
  ["organisation_admin","overview"],
  ["viewer","documents"],
  ["executive_viewer","documents"],
])("redirects %s before reading accepted revisions, issue history or client details",async(nextRole,path)=>{
  role=nextRole;
  await expect(page()).rejects.toThrow(`redirect:${base}/${path}`);
  expect(from).not.toHaveBeenCalled();
  expect(TransmittalCreateForm).not.toHaveBeenCalled();
});
