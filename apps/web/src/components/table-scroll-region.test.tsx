import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {TableScrollRegion} from "./table-scroll-region";
import {ReportScrollRegion} from "./report-scroll-region";
import {AdminPreviewBoundary} from "./admin-preview-boundary";
import {MdrDocumentRows} from "./mdr-document-rows";
import {MdrImportDialog} from "./mdr-import-dialog";
import {ProjectGovernanceControls} from "./project-governance-controls";
import AuditPage from "@/app/app/[organisationId]/audit/page";
import AllDocumentsPage from "@/app/app/documents/page";
import type {MdrDocument} from "@/lib/mdr-register-types";
import styles from "./table-scroll-region.module.css";
import reportStyles from "./project-report-presentation.module.css";

const mocks=vi.hoisted(()=>({requireUser:vi.fn(),from:vi.fn(),rpc:vi.fn(),fetch:vi.fn(),refresh:vi.fn(),preview:vi.fn(),backup:vi.fn(),policy:vi.fn(),restore:vi.fn(),archive:vi.fn(),trash:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireUser:mocks.requireUser}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:mocks.refresh}),notFound:()=>{throw new Error("NEXT_NOT_FOUND");}}));
vi.mock("@/app/app/governance-actions",()=>({enterAdminRolePreview:mocks.preview}));
vi.mock("@/app/app/actions",()=>({requestProjectBackup:mocks.backup,updateProjectBackupPolicy:mocks.policy,restoreTrashedProject:mocks.restore,setProjectArchived:mocks.archive,trashProject:mocks.trash}));
vi.mock("@/components/help-tip",()=>({HelpTip:()=>null}));
vi.mock("@/components/mdr-document-actions",()=>({MdrDocumentActions:({documentNumber}:{documentNumber:string})=><button type="button">Manage {documentNumber}</button>}));

type Result={data:unknown;error:null};
type Read={table:string;filters:[string,unknown][];selection?:string;order?:[string,unknown];limit?:number;search?:string};
let results:Record<string,Result>,reads:Read[];
function query(table:string){
  const read:Read={table,filters:[]};reads.push(read);
  const promise=Promise.resolve(results[table]??{data:[],error:null});
  const chain={select:(value:string)=>{read.selection=value;return chain;},eq:(column:string,value:unknown)=>{read.filters.push([column,value]);return chain;},order:(column:string,options?:unknown)=>{read.order=[column,options];return chain;},limit:(value:number)=>{read.limit=value;return chain;},or:(value:string)=>{read.search=value;return chain;},then:promise.then.bind(promise)};
  return chain;
}
const nativeTable=<table><caption>Controlled values</caption><thead><tr><th scope="col">Document</th><th scope="col">Status</th></tr></thead><tbody><tr><th scope="row">DOC-001</th><td>IFR</td></tr></tbody></table>;
const doc:MdrDocument={id:"document",document_number:"EL-001",title:"Electrical load list",document_type:"List",discipline:"Electrical",status:"draft",area:null,system:null,work_package:null,planned_submission_date:"2026-10-20",updated_at:"2026-10-16T09:00:00Z",lifecycle_status:"active",document_revisions:[],schedule:{document_id:"document",planned_submission_date:"2026-10-20",next_submission_date:"2026-10-20",last_issue_date:null,revision_cycle_days:3,deadline_kind:"first_issue",overdue:false}};
function tableRegion(label:string,caption:string){
  const region=screen.getByRole("region",{name:label});
  expect(region.getAttribute("tabindex")).toBe("0");expect(region.classList.contains(styles.region)).toBe(true);
  const table=within(region).getByRole("table",{name:caption});
  for(const header of within(table).getAllByRole("columnheader"))expect(header.getAttribute("scope")).toBe("col");
  region.focus();expect(document.activeElement).toBe(region);
  expect(fireEvent.keyDown(region,{key:"ArrowRight"})).toBe(true);
  return {region,table};
}
beforeEach(()=>{
  vi.clearAllMocks();reads=[];vi.stubGlobal("fetch",mocks.fetch);
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
  Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
  results={get_my_organisations:{data:[{organisation_id:"org",name:"Example organisation",role:"organisation_admin"}],error:null},project_access:{data:[{organisation_id:"org",project_id:"project",code:"P-001",name:"Example project",role:"document_controller"}],error:null},documents:{data:[{...doc,organisation_id:"org",project_id:"project"}],error:null},audit_events:{data:[{id:"event",created_at:"2026-10-16T09:00:00Z",action:"revision.upload_completed",outcome:"succeeded",target_type:"document",actor_user_id:"engineer"}],error:null}};
  mocks.from.mockImplementation(query);mocks.rpc.mockImplementation(query);mocks.requireUser.mockResolvedValue({supabase:{from:mocks.from,rpc:mocks.rpc}});
});
afterEach(()=>{for(const action of [mocks.preview,mocks.backup,mocks.policy,mocks.restore,mocks.archive,mocks.trash])expect(action).not.toHaveBeenCalled();cleanup();vi.unstubAllGlobals();});

describe("shared native table-scroll foundation",()=>{
  it("keeps one native table, exact caller labels and browser keyboard behavior",()=>{
    render(<TableScrollRegion label="Register — scroll horizontally" className="caller-border">{nativeTable}</TableScrollRegion>);
    const {region,table}=tableRegion("Register — scroll horizontally","Controlled values");
    expect(region.classList.contains("caller-border")).toBe(true);expect(region.hasAttribute("data-preview-safe")).toBe(false);
    expect(screen.getAllByRole("table")).toHaveLength(1);expect(within(table).getByRole("rowheader",{name:"DOC-001"}).getAttribute("scope")).toBe("row");
    expect(within(table).getByRole("cell",{name:"IFR"})).toBeTruthy();expect(region.querySelector('[role="grid"]')).toBeNull();
  });
  it("preserves report labels, read-only preview support and report print class",()=>{
    render(<ReportScrollRegion label="Discipline performance" className="report-border">{nativeTable}</ReportScrollRegion>);
    const {region}=tableRegion("Discipline performance — scroll horizontally","Controlled values");
    expect(region.classList.contains(reportStyles.scrollRegion)).toBe(true);expect(region.classList.contains("report-border")).toBe(true);expect(region.hasAttribute("data-preview-safe")).toBe(true);
    const reportCss=readFileSync(resolve(process.cwd(),"src/components/project-report-presentation.module.css"),"utf8");
    expect(reportCss.slice(reportCss.indexOf("@media print"))).toMatch(/\.scrollRegion table\s*\{[^}]*min-width:\s*0\s*!important/);
  });
  it("does not unlock nested write controls in an audited preview",()=>{
    const mutate=vi.fn();
    const preview={organisationId:"org",projectId:"project",role:"document_controller" as const,displayName:"DCC member",disciplines:[],expiresAt:"2026-10-16T10:00:00Z"};
    render(<AdminPreviewBoundary preview={preview}><TableScrollRegion label="Editable register"><table><caption>Editable values</caption><tbody><tr><td><form method="post" onSubmit={mutate}><button>Save document</button></form></td></tr></tbody></table></TableScrollRegion></AdminPreviewBoundary>);
    const save=screen.getByRole("button",{name:"Save document"}) as HTMLButtonElement;
    expect(save.disabled).toBe(true);expect(save.closest("[data-preview-safe]")).toBeNull();
    fireEvent.submit(save.closest("form")!);expect(mutate).not.toHaveBeenCalled();
    screen.getByRole("region",{name:"Editable register"}).focus();expect(document.activeElement?.getAttribute("role")).toBe("region");
  });
  it("centralises native overflow and inherited visible focus without scripting scrolling",()=>{
    const css=readFileSync(resolve(process.cwd(),"src/components/table-scroll-region.module.css"),"utf8");
    expect(css).toMatch(/min-width:\s*0/);expect(css).toMatch(/overflow-x:\s*auto/);expect(css).toMatch(/overscroll-behavior-x:\s*contain/);
    expect(css).toMatch(/\.region:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--focus, #10243e\)/);
  });
});

describe("MDR table consumers preserve document and import behavior",()=>{
  it.each([true,false])("keeps existing MDR row controls when canManage=%s",canManage=>{
    render(<MdrDocumentRows docs={[doc]} organisationId="org" projectId="project" canManage={canManage} title="Electrical"/>);
    const {region,table}=tableRegion("Master document register — Electrical — scroll horizontally for all columns","Electrical MDR deliverables");
    expect(screen.getAllByRole("table")).toHaveLength(1);expect(region.className).toContain("hidden md:block");expect(region.hasAttribute("data-preview-safe")).toBe(false);
    expect(within(table).getByRole("link",{name:/^EL-001\s*Electrical load list$/}).getAttribute("href")).toBe("/app/org/projects/project/documents/document");
    expect(within(table).getByText("Due 20 Oct 2026")).toBeTruthy();expect(within(table).getByText("Not submitted")).toBeTruthy();
    expect(within(table).queryByRole("columnheader",{name:"Actions"})!==null).toBe(canManage);expect(within(table).queryByRole("button",{name:"Manage EL-001"})!==null).toBe(canManage);
  });
  it("keeps workbook validation and complete import payload unchanged",async()=>{
    const rows=[1,2].map(index=>({row_number:index+1,document_number:`DOC-${index}`,title:`Deliverable ${index}`,discipline:"Electrical",document_type:"List",planned_submission_date:"2026-11-02",is_valid:true,errors:[]}));
    mocks.fetch.mockResolvedValueOnce({ok:true,json:async()=>({sheetName:"MDR",rowCount:2,validCount:2,errorCount:0,canImport:true,rows})}).mockResolvedValueOnce({ok:false,json:async()=>({error:{message:"Import could not finish. Retry shortly."}})});
    render(<MdrImportDialog organisationId="org" projectId="project"/>);fireEvent.click(screen.getByRole("button",{name:"Import Excel"}));
    fireEvent.change(screen.getByLabelText("Choose Excel file"),{target:{files:[new File(["synthetic"],"MDR.xlsx")]}});fireEvent.click(screen.getByRole("button",{name:"Preview workbook"}));
    await screen.findByRole("table",{name:"Workbook validation preview"});
    const {region,table}=tableRegion("Workbook validation preview","Workbook validation preview");expect(region.hasAttribute("data-preview-safe")).toBe(false);expect(within(table).getAllByRole("columnheader")).toHaveLength(7);
    expect(within(table).getAllByRole("row")).toHaveLength(3);expect(within(table).getByText("DOC-2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Import 2 documents"}));await screen.findByRole("alert");
    const [url,request]=mocks.fetch.mock.calls[1];expect(url).toBe("/api/v1/organisations/org/projects/project/documents/import");expect(request.method).toBe("PUT");expect(JSON.parse(request.body)).toEqual({rows});
  });
});

describe("audit and cross-project document table consumers",()=>{
  it("retains the admin-only audit query, action filter and all audit cells",async()=>{
    render(await AuditPage({params:Promise.resolve({organisationId:"org"}),searchParams:Promise.resolve({action:"revision.upload_completed"})}));
    const {region,table}=tableRegion("Organisation audit log — scroll horizontally","Organisation audit log");expect(region.hasAttribute("data-preview-safe")).toBe(false);
    expect(within(table).getAllByRole("columnheader").map(header=>header.textContent)).toEqual(["Time","Action","Outcome","Target","Actor"]);
    expect(within(table).getAllByRole("cell").map(cell=>cell.textContent)).toEqual([expect.any(String),"revision.upload_completed","succeeded","document","engineer"]);
    expect(reads.find(read=>read.table==="audit_events")).toMatchObject({filters:[["organisation_id","org"],["action","revision.upload_completed"]],order:["created_at",{ascending:false}],limit:200});
    expect(screen.getByRole("textbox",{name:"Filter by exact action"})).toHaveProperty("value","revision.upload_completed");
  });
  it("does not read or render an audit table for confirmed non-administrators",async()=>{
    results.get_my_organisations={data:[{organisation_id:"org",role:"member"}],error:null};
    await expect(AuditPage({params:Promise.resolve({organisationId:"org"}),searchParams:Promise.resolve({})})).rejects.toThrow("NEXT_NOT_FOUND");expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each(["document_controller","project_admin"])("retains cross-project document cells and role-safe links for %s",async role=>{
    (results.project_access.data as {role:string}[])[0].role=role;
    render(await AllDocumentsPage({searchParams:Promise.resolve({q:"EL",organisationId:"org",projectId:"project"})}));
    const {table}=tableRegion("Your documents — scroll horizontally","Your documents");
    expect(within(table).getAllByRole("columnheader").map(header=>header.textContent)).toEqual(["Document","Organisation","Project","Type","Discipline","Status"]);
    expect(within(table).getByText("EL-001")).toBeTruthy();expect(within(table).getByText("Electrical load list")).toBeTruthy();expect(within(table).queryByRole("link",{name:"EL-001"})!==null).toBe(role==="document_controller");
    expect(reads.find(read=>read.table==="documents")).toMatchObject({filters:[["organisation_id","org"],["project_id","project"]],order:["updated_at",{ascending:false}],limit:200,search:"document_number.ilike.%EL%,title.ilike.%EL%"});
  });
});

describe("governance backup history table",()=>{
  it("keeps download eligibility, backup inputs and destructive safeguards unchanged",()=>{
    const project={id:"project",organisationId:"org",code:"P-001",name:"Example project",status:"active",purgeAfter:null};
    const backups=[{id:"ready",provider:"engicite",trigger_kind:"manual",state:"ready",byte_size:1024,external_location:null,error_code:null,created_at:"2026-10-16T09:00:00Z",completed_at:"2026-10-16T09:01:00Z"},{id:"failed",provider:"engicite",trigger_kind:"scheduled",state:"failed",byte_size:1024,external_location:null,error_code:"failed",created_at:"2026-10-15T09:00:00Z",completed_at:null}];
    render(<ProjectGovernanceControls project={project} policy={null} backups={backups} connections={[]}/>);
    const {region,table}=tableRegion("Project backup history — scroll horizontally","Project backup history");expect(region.hasAttribute("data-preview-safe")).toBe(false);
    expect(within(table).getAllByRole("columnheader").map(header=>header.textContent)).toEqual(["Created","Trigger","Destination","Status","Size","Actions"]);
    const links=within(table).getAllByRole("link",{name:"Download"});expect(links).toHaveLength(1);expect(links[0].getAttribute("href")).toBe("/api/v1/organisations/org/projects/project/backups/ready/download");
    expect(within(table).getByText("failed")).toBeTruthy();
    const manual=screen.getByRole("button",{name:"Create project backup"}).closest("form")!;
    expect(Array.from(new FormData(manual))).toEqual([["organisationId","org"],["projectId","project"],["provider","engicite"],["destinationPath","/EngiCite Backups"]]);
    expect((screen.getByRole("button",{name:"Delete project"}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button",{name:"Save backup schedule"})).toBeTruthy();
  });
});
