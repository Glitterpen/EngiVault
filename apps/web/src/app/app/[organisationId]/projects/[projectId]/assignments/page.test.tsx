import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import AssignmentsPage from "./page";
const state=vi.hoisted(()=>({failed:"",hasDocument:false}));
vi.mock("@/components/help-tip",()=>({HelpTip:()=>null}));
vi.mock("@/lib/document-schedule",()=>({loadDocumentSchedules:async()=>new Map([["doc",{document_id:"doc",next_submission_date:null,overdue:false}]])}));
vi.mock("@/lib/auth",()=>({requireProject:async()=>({user:{id:"member"},access:{role:"engineer"},supabase:{
  from:(table:string)=>{
    const rows:Record<string,unknown>={projects:{code:"P01",name:"Test project",delivery_stage:"feed"},project_member_disciplines:[{discipline:"Mechanical"}],document_assignments:state.hasDocument?[{document_id:"doc"}]:[],documents:state.hasDocument?[{id:"doc",discipline:"Mechanical",progress_weight:1}]:[]};
    const result={data:rows[table]??[],error:state.failed===table?{message:"private failure"}:null};
    const query={select:()=>query,eq:()=>query,in:()=>query,order:()=>query,limit:()=>query,maybeSingle:()=>query,then:(resolve:(value:typeof result)=>unknown)=>Promise.resolve(result).then(resolve)};
    return query;
  },
  rpc:async()=>({data:null,error:{message:"aggregate unavailable"}}),
}})}));
beforeEach(()=>{state.failed="";state.hasDocument=false;});
afterEach(cleanup);
const page=()=>AssignmentsPage({params:Promise.resolve({organisationId:"org",projectId:"project"}),searchParams:Promise.resolve({})});
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
