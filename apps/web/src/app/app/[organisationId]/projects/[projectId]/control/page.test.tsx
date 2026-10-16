import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,render,screen,within} from "@testing-library/react";
import Dashboard from "./page";
import {requireProject} from "@/lib/auth";
import {loadDocumentSchedules} from "@/lib/document-schedule";

vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/lib/document-schedule",()=>({loadDocumentSchedules:vi.fn()}));
vi.mock("@/components/help-tip",()=>({HelpTip:()=>null}));
vi.mock("@/components/project-management-forms",()=>({ProjectIssueForm:()=> <button type="button">Report issue</button>}));
vi.mock("next/navigation",()=>({redirect:vi.fn((href:string)=>{throw new Error(`redirect:${href}`);})}));

const organisationId="a0000000-0000-4000-8000-000000000001";
const projectId="b0000000-0000-4000-8000-000000000001";
const base=`/app/${organisationId}/projects/${projectId}`;
type QueryResult={data:unknown;error:unknown};
let results:Record<string,QueryResult>;
let role:string;
let preview:unknown;
const from=vi.fn();
const rpc=vi.fn();

function query(result:QueryResult){
  const builder={
    select:vi.fn(()=>builder),
    eq:vi.fn(()=>builder),
    neq:vi.fn(()=>builder),
    order:vi.fn(()=>builder),
    single:vi.fn(async()=>result),
    then:<TResult1=QueryResult,TResult2=never>(
      fulfilled?:((value:QueryResult)=>TResult1|PromiseLike<TResult1>)|null,
      rejected?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null,
    )=>Promise.resolve(result).then(fulfilled,rejected),
  };
  return builder;
}
const dashboard=()=>Dashboard({params:Promise.resolve({organisationId,projectId})});
function summaryValue(label:string){
  const term=screen.getByText(label,{selector:"dt"});
  const definition=term.nextElementSibling;
  expect(definition?.tagName).toBe("DD");
  return definition?.textContent;
}
function disclosure(label:string){
  const summary=screen.getByText(label,{selector:"summary, summary *"}).closest("summary");
  expect(summary).toBeTruthy();
  const details=summary?.closest("details");
  expect(details).toBeTruthy();
  return details as HTMLDetailsElement;
}

beforeEach(()=>{
  vi.clearAllMocks();
  role="document_controller";
  preview=null;
  results={
    projects:{data:{code:"FEED-01",name:"FEED engineering",project_introduction:"Project delivery brief",key_objectives:["Complete FEED safely"],planned_end_date:"2027-01-30"},error:null},
    documents:{data:[
      {id:"mechanical",document_number:"MEC-001",discipline:"Mechanical",planned_submission_date:null,document_revisions:[{state:"pending_upload",control_status:"submitted"},{state:"ready",control_status:"accepted"}]},
      {id:"electrical",document_number:"ELE-001",discipline:"Electrical & Instrumentation",planned_submission_date:null,document_revisions:[{state:"ready",control_status:"submitted"}]},
      {id:"new",document_number:"MEC-002",discipline:"Mechanical",planned_submission_date:null,document_revisions:[]},
    ],error:null},
    project_issues:{data:[{id:"issue",severity:"medium",status:"open"}],error:null},
  };
  from.mockImplementation((table:string)=>query(results[table]));
  rpc.mockResolvedValue({data:[{role:"engineer"},{role:"document_controller"}],error:null});
  vi.mocked(requireProject).mockImplementation(async()=>({supabase:{from,rpc},access:{role},preview} as never));
  vi.mocked(loadDocumentSchedules).mockResolvedValue(new Map([
    ["mechanical",{document_id:"mechanical",overdue:false}],
    ["electrical",{document_id:"electrical",overdue:true}],
    ["new",{document_id:"new",overdue:false}],
  ]) as never);
});
afterEach(cleanup);

it("provides one primary MDR destination and a visible operational work queue",async()=>{
  render(await dashboard());
  expect(screen.getByRole("heading",{level:1,name:"Document control centre"})).toBeTruthy();
  expect(screen.getAllByRole("link",{name:"Open MDR"})).toHaveLength(1);
  const destinations=[
    ["Open MDR","/documents"],
    ["Review submissions","/reviews"],
    ["Deliverable requests","/requests"],
    ["Create transmittal","/work-packages/transmittals/new"],
    ["Work packages","/work-packages"],
  ];
  for(const [name,path] of destinations){
    const link=screen.getByRole("link",{name:new RegExp(`^${name}(?:\\b|$)`)});
    expect(link.getAttribute("href")).toBe(`${base}${path}`);
    expect(link.closest("details")).toBeNull();
  }
});

it("uses labelled summary values and excludes incomplete uploads from the review queue",async()=>{
  render(await dashboard());
  expect(summaryValue("MDR deliverables")).toBe("3");
  expect(summaryValue("Awaiting review")).toBe("1");
  expect(summaryValue("Not submitted")).toBe("1");
  expect(summaryValue("Overdue")).toBe("1");
  expect(loadDocumentSchedules).toHaveBeenCalledWith(expect.anything(),organisationId,projectId,["mechanical","electrical","new"]);
});

it("keeps supplementary information in collapsed, keyboard-operable native disclosures",async()=>{
  render(await dashboard());
  for(const label of ["MDR by discipline","Project brief and dates","Project issues"]){
    expect(disclosure(label).open).toBe(false);
  }
  expect(within(disclosure("Project brief and dates")).getByText("Project delivery brief")).toBeTruthy();
  expect(within(disclosure("Project issues")).getByRole("button",{name:"Report issue",hidden:true})).toBeTruthy();
});

it("links every MDR discipline to its folder without narrowing the register",async()=>{
  render(await dashboard());
  const links=Array.from(disclosure("MDR by discipline").querySelectorAll("a"));
  expect(links).toHaveLength(2);
  const disciplines=links.map(link=>{
    const url=new URL(link.getAttribute("href")!,"https://app.engicite.com");
    expect(url.pathname).toBe(`${base}/documents`);
    const folder=url.searchParams.get("folder");
    expect(folder).toBeTruthy();
    expect(Object.fromEntries(url.searchParams)).toEqual({folder});
    expect(link.textContent).toContain(folder);
    return folder;
  });
  expect(disciplines.sort()).toEqual(["Electrical & Instrumentation","Mechanical"]);
  expect(screen.getByRole("link",{name:"Open MDR"}).getAttribute("href")).toBe(`${base}/documents`);
});

it("omits issue mutation controls during an audited read-only preview",async()=>{
  preview={targetUserId:"reviewed-member"};
  render(await dashboard());
  expect(screen.queryByRole("button",{name:"Report issue",hidden:true})).toBeNull();
  expect(disclosure("Project issues").textContent).toMatch(/read.only/i);
  expect(screen.getByRole("link",{name:"Open MDR"})).toBeTruthy();
});

it.each([
  ["engineer","assignments"],
  ["project_admin","overview"],
  ["organisation_admin","overview"],
  ["viewer","documents"],
])("redirects %s before loading DCC data",async(nextRole,path)=>{
  role=nextRole;
  await expect(dashboard()).rejects.toThrow(`redirect:${base}/${path}`);
  expect(from).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
  expect(loadDocumentSchedules).not.toHaveBeenCalled();
});

it.each(["projects","documents"])("shows a safe retry alert rather than zero metrics when %s fails",async(table)=>{
  results[table]={data:null,error:{message:"postgres internal-table credential=private-test-detail"}};
  render(await dashboard());
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.getByRole("link",{name:"Retry dashboard"}).getAttribute("href")).toBe(`${base}/control`);
  expect(screen.queryByText("MDR deliverables",{selector:"dt"})).toBeNull();
  expect(document.body.textContent).not.toMatch(/postgres|internal-table|private-test-detail/);
});

it("shows a safe retry alert when document schedules cannot be loaded",async()=>{
  vi.mocked(loadDocumentSchedules).mockRejectedValue(new Error("supabase schedule-view private-test-detail"));
  render(await dashboard());
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.getByRole("link",{name:"Retry dashboard"})).toBeTruthy();
  expect(screen.queryByText("Overdue",{selector:"dt"})).toBeNull();
  expect(document.body.textContent).not.toMatch(/supabase|schedule-view|private-test-detail/);
});

it("keeps loaded register metrics visible when issue and team information are unavailable",async()=>{
  results.project_issues={data:null,error:{message:"private issue failure"}};
  rpc.mockResolvedValue({data:null,error:{message:"private team failure"}});
  render(await dashboard());
  expect(summaryValue("MDR deliverables")).toBe("3");
  expect(summaryValue("Awaiting review")).toBe("1");
  expect(disclosure("Project issues").textContent).toMatch(/unavailable/i);
  expect(document.body.textContent).toMatch(/engineers[\s\S]{0,80}unavailable|unavailable[\s\S]{0,80}engineers/i);
  expect(document.body.textContent).not.toMatch(/private issue failure|private team failure/);
});

it("shows genuine zero values when the MDR is successfully loaded and empty",async()=>{
  results.documents={data:[],error:null};
  results.project_issues={data:[],error:null};
  rpc.mockResolvedValue({data:[],error:null});
  vi.mocked(loadDocumentSchedules).mockResolvedValue(new Map());
  render(await dashboard());
  for(const label of ["MDR deliverables","Awaiting review","Not submitted","Overdue"]){
    expect(summaryValue(label)).toBe("0");
  }
  expect(screen.queryByRole("alert")).toBeNull();
  expect(disclosure("MDR by discipline").textContent).toMatch(/empty|no.*deliverables|register.*first/i);
});
