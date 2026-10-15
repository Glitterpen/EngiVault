import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import AssignmentsPage from "./page";
const state=vi.hoisted(()=>({
  failed:"",hasDocument:false,hasImpact:false,role:"engineer",revisions:[] as Record<string,string>[],
  documents:null as Record<string,unknown>[]|null,assignedIds:null as string[]|null,disciplines:["Mechanical"],
  scheduleOverrides:{} as Record<string,Record<string,unknown>>,sourceReads:[] as string[],
}));
vi.mock("next/navigation",()=>({redirect:vi.fn((href:string)=>{throw new Error(`NEXT_REDIRECT:${href}`);})}));
vi.mock("@/components/help-tip",()=>({HelpTip:()=>null}));
vi.mock("@/lib/document-schedule",()=>({loadDocumentSchedules:async(_client:unknown,_organisation:string,_project:string,documentIds:string[])=>new Map(documentIds.map(id=>[id,{document_id:id,planned_submission_date:null,next_submission_date:null,last_issue_date:null,revision_cycle_days:null,deadline_kind:"first_issue",overdue:false,...state.scheduleOverrides[id]}]))}));
vi.mock("@/lib/auth",()=>({requireProject:async()=>({user:{id:"member"},access:{role:state.role},supabase:{
  from:(table:string)=>{
    state.sourceReads.push(table);
    const documents=state.documents??(state.hasDocument?[{id:"doc",document_number:"M-001",title:"Mechanical design",discipline:"Mechanical",document_type:"Calculation",progress_weight:1}]:[]);
    const rows:Record<string,unknown>={projects:{code:"P01",name:"Test project",delivery_stage:"feed"},project_member_disciplines:state.disciplines.map(discipline=>({discipline})),document_assignments:(state.assignedIds??(state.hasDocument?["doc"]:[])).map(document_id=>({document_id})),documents};
    const result={data:table==="document_revisions"?state.revisions:rows[table]??[],error:state.failed===table?{message:"private failure"}:null};
    const query={select:()=>query,eq:()=>query,in:()=>query,order:()=>query,limit:()=>query,maybeSingle:()=>query,then:(resolve:(value:typeof result)=>unknown)=>Promise.resolve(result).then(resolve)};
    return query;
  },
  rpc:async()=>state.hasImpact?{data:{project_actual_percent:25,project_planned_percent:25},error:null}:{data:null,error:{message:"aggregate unavailable"}},
}})}));
beforeEach(()=>{state.failed="";state.hasDocument=false;state.hasImpact=false;state.role="engineer";state.revisions=[];state.documents=null;state.assignedIds=null;state.disciplines=["Mechanical"];state.scheduleOverrides={};state.sourceReads=[];});
afterEach(cleanup);
const page=(view?:string,q?:string)=>AssignmentsPage({params:Promise.resolve({organisationId:"org",projectId:"project"}),searchParams:Promise.resolve({view,q})});
const makeDocument=(id:string,overrides:Record<string,unknown>={})=>({id,document_number:`M-${id}`,title:`Deliverable ${id}`,discipline:"Mechanical",document_type:"Calculation",planned_submission_date:null,planned_final_date:null,required_issue_status:"Issued for Design (IFD)",responsible_party:null,progress_weight:1,...overrides});
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
  expect(screen.getByRole("heading",{level:1,name:"My deliverables"})).toBeTruthy();
  expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
  expect(screen.getByText("P01 · Test project").closest("details")).toBeNull();
  expect(screen.queryByText("Discipline Engineer workspace")).toBeNull();
  expect(screen.getByText("Project Manager-authorised disciplines").className).not.toContain("uppercase");
  expect(screen.getByText("Project-wide progress is temporarily unavailable").closest('[role="status"]')).toBeTruthy();
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
  expect(screen.getByRole("link",{name:"Create request: date change or additional deliverable"}).closest("details")).toBeNull();
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
  expect(region.querySelectorAll(":scope > details")).toHaveLength(1);
  expect(region.querySelector("summary")?.textContent).toContain("Issued for Approval (IFA)");
  expect(region.querySelector("summary")?.textContent).toContain("1 deliverable");
  expect(within(region).getByText("Latest B · IFA")).toBeTruthy();
  expect(region.querySelector(":scope > details")?.hasAttribute("open")).toBe(true);
});
it("keeps unsubmitted deliverables separate and respects status filtering",async()=>{
  state.hasDocument=true;
  render(await page());
  expect(screen.getByRole("region",{name:"Submissions by issue purpose"}).querySelector("summary")?.textContent).toContain("Not submitted");
  cleanup();
  render(await page("review"));
  const region=screen.getByRole("region",{name:"Submissions by issue purpose"});
  expect(region.querySelectorAll(":scope > details")).toHaveLength(0);
  expect(within(region).getByText("No deliverables match this status.")).toBeTruthy();
});

it.each([
  ["organisation_admin","overview"],
  ["project_admin","overview"],
  ["document_controller","control"],
  ["viewer","documents"],
])("redirects %s before loading engineer assignment data",async(role,destination)=>{
  state.role=role;
  await expect(page()).rejects.toThrow(`NEXT_REDIRECT:/app/org/projects/project/${destination}`);
  expect(state.sourceReads).toEqual([]);
});

it("shows only deliverables with both an active assignment and an authorised discipline",async()=>{
  state.documents=[
    makeDocument("authorised"),
    makeDocument("not-assigned"),
    makeDocument("wrong-discipline",{discipline:"Electrical"}),
    makeDocument("case-match",{discipline:" mechanical "}),
  ];
  state.assignedIds=["authorised","wrong-discipline","case-match"];
  render(await page());
  const submissions=screen.getByRole("region",{name:"Submissions by issue purpose"});
  expect(within(submissions).getByText("Deliverable authorised")).toBeTruthy();
  expect(within(submissions).getByText("Deliverable case-match")).toBeTruthy();
  expect(within(submissions).queryByText("Deliverable not-assigned")).toBeNull();
  expect(within(submissions).queryByText("Deliverable wrong-discipline")).toBeNull();
});

it("keeps FEED IFD acceptance at full progress and does not require a construction issue",async()=>{
  state.hasDocument=true;
  state.revisions=[{document_id:"doc",issue_status:"Issued for Design (IFD)",revision_code:"D01",state:"ready",control_status:"accepted"}];
  render(await page("accepted"));
  const submissions=screen.getByRole("region",{name:"Submissions by issue purpose"});
  expect(submissions.textContent).toContain("Stage accepted");
  expect(submissions.textContent).toContain("Progress credit: 100%");
  expect(submissions.textContent).not.toContain("Next revision required");
  expect(screen.getAllByText("100% at Issued for Design (IFD)").length).toBeGreaterThan(0);
  const progress=screen.getByRole("progressbar",{name:"Stage-weighted progress"});
  expect(progress.getAttribute("aria-valuemin")).toBe("0");
  expect(progress.getAttribute("aria-valuemax")).toBe("100");
  expect(progress.getAttribute("aria-valuenow")).toBe("100");
});

it("retains the direct request, upload and date-change routes and DCC feedback",async()=>{
  state.hasDocument=true;
  state.scheduleOverrides.doc={next_submission_date:"2026-11-20",planned_submission_date:"2026-11-20"};
  state.revisions=[{document_id:"doc",issue_status:"Issued for Review (IFR)",revision_code:"R01",state:"ready",control_status:"returned",review_comment:"Correct the equipment pressure schedule."}];
  render(await page());
  expect(screen.getByRole("link",{name:"Create request: date change or additional deliverable"}).getAttribute("href")).toBe("/app/org/projects/project/requests");
  const submissions=screen.getByRole("region",{name:"Submissions by issue purpose"});
  const issueGroup=submissions.querySelector(":scope > details");
  const upload=within(submissions).getByRole("link",{name:"Upload corrected revision"});
  expect(upload.getAttribute("href")).toBe("/app/org/projects/project/documents/doc#submit-revision");
  expect(upload.closest("details")).toBe(issueGroup);
  const dateChange=within(submissions).getByRole("link",{name:"Request submission date change"});
  expect(dateChange.getAttribute("href")).toBe("/app/org/projects/project/requests?document=doc#new-request");
  expect(dateChange.closest("details")).toBe(issueGroup);
  expect(submissions.textContent).toContain("Document Controller feedback");
  const feedback=within(submissions).getByText("Correct the equipment pressure schedule.");
  expect(feedback.closest("details")).toBe(issueGroup);
  expect(submissions.textContent).toContain("Latest R01 · Issued for Review (IFR)");
  const schedule=within(submissions).getByText("Details & schedule",{exact:false}).closest("details");
  expect(schedule).toBeTruthy();
  expect(schedule).not.toBe(issueGroup);
  expect(schedule?.hasAttribute("open")).toBe(false);
});

it.each(["m-unique","pressure balance","mechanical","design specification","r-unique","issued for review"])("searches %s case-insensitively without changing assignment scope or status counts",async(query)=>{
  state.documents=[
    makeDocument("match",{document_number:"M-UNIQUE",title:"Pressure balance",document_type:"Design specification"}),
    makeDocument("other",{discipline:"Electrical"}),
    makeDocument("not-assigned",{title:"Pressure balance",document_number:"M-UNIQUE"}),
  ];
  state.disciplines=["Mechanical","Electrical"];
  state.assignedIds=["match","other"];
  state.revisions=[{document_id:"match",issue_status:"Issued for Review (IFR)",revision_code:"R-UNIQUE",state:"ready",control_status:"submitted"}];
  render(await page(undefined,query.toUpperCase()));
  const submissions=screen.getByRole("region",{name:"Submissions by issue purpose"});
  expect(within(submissions).getByText("Pressure balance")).toBeTruthy();
  expect(within(submissions).queryByText("Deliverable other")).toBeNull();
  expect(within(submissions).getAllByText("Pressure balance")).toHaveLength(1);
  const statuses=screen.getByRole("navigation",{name:"Deliverable status"});
  expect(within(statuses).getByRole("link",{name:/All.*2/})).toBeTruthy();
  expect(within(statuses).getByRole("link",{name:/In DCC review.*1/})).toBeTruthy();
});

it("submits search as a GET, retains search across status filters, and clears it without changing the status",async()=>{
  state.hasDocument=true;
  const {container}=render(await page("action","Pressure & balance"));
  const input=container.querySelector<HTMLInputElement>('input[name="q"]');
  expect(input?.value).toBe("Pressure & balance");
  expect(input?.closest("form")?.getAttribute("method")?.toLowerCase()).toBe("get");
  const statuses=screen.getByRole("navigation",{name:"Deliverable status"});
  for(const link of within(statuses).getAllByRole("link")){
    expect(new URL(link.getAttribute("href")!,"https://app.engicite.com").searchParams.get("q")).toBe("Pressure & balance");
  }
  const clear=screen.getByRole("link",{name:/clear search/i});
  const destination=new URL(clear.getAttribute("href")!,"https://app.engicite.com");
  expect(destination.pathname).toBe("/app/org/projects/project/assignments");
  expect(destination.searchParams.has("q")).toBe(false);
  expect(destination.searchParams.get("view")).toBe("action");
});

it("combines search with the chosen status instead of bypassing the status filter",async()=>{
  state.hasDocument=true;
  state.revisions=[{document_id:"doc",issue_status:"IFR",revision_code:"R01",state:"ready",control_status:"submitted"}];
  render(await page("accepted","Mechanical design"));
  const submissions=screen.getByRole("region",{name:"Submissions by issue purpose"});
  expect(within(submissions).queryByText("Mechanical design")).toBeNull();
  expect(submissions.querySelectorAll(":scope > details")).toHaveLength(0);
});

it("preserves an unsubmitted search draft across status rendering and resets it when the URL search is cleared",async()=>{
  state.hasDocument=true;
  const {rerender}=render(await page(undefined,"Pressure"));
  fireEvent.change(screen.getByRole("searchbox",{name:"Search deliverables"}),{target:{value:"Draft search"}});
  rerender(await page("action","Pressure"));
  expect((screen.getByRole("searchbox",{name:"Search deliverables"}) as HTMLInputElement).value).toBe("Draft search");
  rerender(await page("action",""));
  expect((screen.getByRole("searchbox",{name:"Search deliverables"}) as HTMLInputElement).value).toBe("");
});
