import {cleanup,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import AssignmentsPage from "./page";
const state=vi.hoisted(()=>({failed:"",hasDocument:false,hasImpact:false,revisions:[] as Record<string,string>[]}));
vi.mock("@/components/help-tip",()=>({HelpTip:()=>null}));
vi.mock("@/lib/document-schedule",()=>({loadDocumentSchedules:async()=>new Map([["doc",{document_id:"doc",next_submission_date:null,overdue:false}]])}));
vi.mock("@/lib/auth",()=>({requireProject:async()=>({user:{id:"member"},access:{role:"engineer"},supabase:{
  from:(table:string)=>{
    const rows:Record<string,unknown>={projects:{code:"P01",name:"Test project",delivery_stage:"feed"},project_member_disciplines:[{discipline:"Mechanical"}],document_assignments:state.hasDocument?[{document_id:"doc"}]:[],documents:state.hasDocument?[{id:"doc",discipline:"Mechanical",progress_weight:1}]:[]};
    const result={data:table==="document_revisions"?state.revisions:rows[table]??[],error:state.failed===table?{message:"private failure"}:null};
    const query={select:()=>query,eq:()=>query,in:()=>query,order:()=>query,limit:()=>query,maybeSingle:()=>query,then:(resolve:(value:typeof result)=>unknown)=>Promise.resolve(result).then(resolve)};
    return query;
  },
  rpc:async()=>state.hasImpact?{data:{project_actual_percent:25,project_planned_percent:25},error:null}:{data:null,error:{message:"aggregate unavailable"}},
}})}));
beforeEach(()=>{state.failed="";state.hasDocument=false;state.hasImpact=false;state.revisions=[];});
afterEach(cleanup);
const page=(view?:string)=>AssignmentsPage({params:Promise.resolve({organisationId:"org",projectId:"project"}),searchParams:Promise.resolve({view})});
it.each(["project_member_disciplines","document_assignments","documents","projects"])("does not show empty assignments when %s fails",async(table)=>{
  state.failed=table;
  render(await page());
  expect(screen.getByRole("alert").textContent).toContain("Your assignments could not be loaded");
  expect(screen.getByRole("link",{name:"Retry assignments"}).getAttribute("href")).toBe("/app/org/projects/project/assignments");
  expect(screen.queryByText("My deliverables")).toBeNull();
  expect(screen.queryByText("private failure")).toBeNull();
});
it("does not invent a revision status after a failed revision fetch",async()=>{
  state.hasDocument=true;state.failed="document_revisions";
  render(await page());
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByText("No revision submitted")).toBeNull();
});
it("retains successfully loaded assignments but hides unavailable project aggregates",async()=>{
  render(await page());
  expect(screen.getByText("My deliverables")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Project-wide progress is temporarily unavailable");
  expect(screen.queryByText("Project delay influence")).toBeNull();
});
it("keeps delivery health and outstanding count visible while secondary summaries start collapsed",async()=>{
  state.hasDocument=true;state.hasImpact=true;
  render(await page());
  const impactSummary=screen.getByText("My project impact").closest("summary");
  expect(impactSummary?.textContent).toContain("On track");
  expect(impactSummary?.closest("details")?.hasAttribute("open")).toBe(false);
  const actionsSummary=screen.getByText("Priority close-out actions",{exact:false}).closest("summary");
  expect(actionsSummary?.textContent).toContain("1 outstanding");
  expect(actionsSummary?.closest("details")?.hasAttribute("open")).toBe(false);
  expect(screen.getByRole("link",{name:"Request a date change or additional deliverable"}).closest("details")).toBeNull();
  expect(screen.getByRole("region",{name:"My deliverables"}).closest("details")).toBeNull();
});
it("groups by the latest completed upload, retains revision codes and ignores pending uploads",async()=>{
  state.hasDocument=true;
  state.revisions=[
    {document_id:"doc",issue_status:"IFC",revision_code:"C",state:"pending_upload",control_status:"pending"},
    {document_id:"doc",issue_status:"IFA",revision_code:"B",state:"ready",control_status:"pending"},
    {document_id:"doc",issue_status:"IFR",revision_code:"A",state:"ready",control_status:"accepted"},
  ];
  render(await page());
  const region=screen.getByRole("region",{name:"Submissions by issue purpose"});
  expect(region.querySelectorAll("details")).toHaveLength(1);
  expect(region.querySelector("summary")?.textContent).toContain("Issued for Approval (IFA)");
  expect(region.querySelector("summary")?.textContent).toContain("1 deliverable");
  expect(within(region).getByText("Latest B · IFA")).toBeTruthy();
  expect(region.querySelector("details")?.hasAttribute("open")).toBe(true);
});
it("keeps unsubmitted deliverables separate and respects status filtering",async()=>{
  state.hasDocument=true;
  render(await page());
  expect(screen.getByRole("region",{name:"Submissions by issue purpose"}).querySelector("summary")?.textContent).toContain("Not submitted");
  cleanup();
  render(await page("review"));
  const region=screen.getByRole("region",{name:"Submissions by issue purpose"});
  expect(region.querySelectorAll("details")).toHaveLength(0);
  expect(within(region).getByText("No deliverables match this status.")).toBeTruthy();
});
