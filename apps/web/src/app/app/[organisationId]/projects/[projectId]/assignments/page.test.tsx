import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import AssignmentsPage from "./page";
const state=vi.hoisted(()=>({
  failed:"",hasDocument:false,hasImpact:false,role:"engineer",revisions:[] as Record<string,string|undefined>[],
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

it("compacts the introduction while retaining the full project identity and authorised disciplines",async()=>{
  state.disciplines=["Electrical","Fire & Gas","Instrumentation","Telecommunications"];
  render(await page());
  const scope=screen.getByText("My disciplines").closest("details")!;
  expect(scope.open).toBe(false);
  expect(scope.querySelector("summary")?.textContent).toContain("(4)");
  fireEvent.click(scope.querySelector("summary")!);
  for(const discipline of state.disciplines)expect(within(scope).getByText(discipline)).toBeTruthy();
  expect(within(scope).getByText("Test project")).toBeTruthy();
  expect(screen.getByRole("heading",{name:"My progress"})).toBeTruthy();
});

it("labels the MDR expected baseline without changing accepted progress or the baseline values",async()=>{
  state.hasDocument=true;state.hasImpact=true;
  render(await page());
  const impact=screen.getByText("My project impact").closest("details")!;
  fireEvent.click(impact.querySelector("summary")!);
  expect(within(impact).getByText("MDR due-date baseline")).toBeTruthy();
  expect(within(impact).getByText("MDR expected 25%")).toBeTruthy();
  expect(within(impact).getByText("Overall project · DCC accepted")).toBeTruthy();
  expect(within(impact).getByRole("progressbar",{name:"Overall project actual progress"}).getAttribute("aria-valuenow")).toBe("25");
});

it("pages large groups independently while search and status counts cover the whole assigned scope",async()=>{
  state.documents=Array.from({length:30},(_,index)=>makeDocument(`d${String(index).padStart(2,"0")}`));
  state.assignedIds=state.documents.map(document=>String(document.id));
  state.revisions=state.assignedIds.map(document_id=>({document_id,issue_status:"IFA",revision_code:"A01",state:"ready",control_status:"submitted"}));
  const {rerender}=render(await page());
  let submissions=screen.getByRole("region",{name:"Submissions by issue purpose"});
  fireEvent.click(submissions.querySelector("summary")!);
  fireEvent.click(within(submissions).getByRole("button",{name:/Next deliverables/}));
  expect(within(submissions).getByText("Deliverable d08")).toBeTruthy();
  expect(within(submissions).queryByText("Deliverable d00")).toBeNull();
  expect(screen.getByText("30 of 30 deliverables")).toBeTruthy();
  expect(within(screen.getByRole("navigation",{name:"Deliverable status"})).getByRole("link",{name:/Awaiting DCC.*30/})).toBeTruthy();
  rerender(await page("review","Deliverable d29"));
  submissions=screen.getByRole("region",{name:"Submissions by issue purpose"});
  expect(submissions.querySelector("details")?.hasAttribute("open")).toBe(false);
  expect(within(submissions).getByText("Deliverable d29")).toBeTruthy();
  expect(within(submissions).queryByRole("button",{name:/Next deliverables/})).toBeNull();
  expect(screen.getByText("1 of 30 deliverables")).toBeTruthy();
  rerender(await page("review"));
  submissions=screen.getByRole("region",{name:"Submissions by issue purpose"});
  fireEvent.click(submissions.querySelector("summary")!);
  expect(within(submissions).getByRole("status").textContent).toBe("Showing 1–8 of 30");
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
  expect(region.querySelector(":scope > details")?.hasAttribute("open")).toBe(false);
});
it("starts every issue-purpose group collapsed without changing labels, counts or item order",async()=>{
  state.documents=[makeDocument("construction"),makeDocument("review-first"),makeDocument("unsubmitted"),makeDocument("design"),makeDocument("review-second"),makeDocument("approval")];
  state.assignedIds=state.documents.map(document=>String(document.id));
  state.revisions=[
    {document_id:"construction",issue_status:"IFC",revision_code:"C01",state:"ready",control_status:"submitted"},
    {document_id:"review-first",issue_status:"IFR",revision_code:"R01",state:"ready",control_status:"submitted"},
    {document_id:"design",issue_status:"IFD",revision_code:"D01",state:"ready",control_status:"submitted"},
    {document_id:"review-second",issue_status:"Issued for Review (IFR)",revision_code:"R02",state:"ready",control_status:"submitted"},
    {document_id:"approval",issue_status:"IFA",revision_code:"A01",state:"ready",control_status:"submitted"},
  ];
  render(await page());
  const region=screen.getByRole("region",{name:"Submissions by issue purpose"});
  const groups=Array.from(region.querySelectorAll<HTMLDetailsElement>(":scope > details"));
  expect(groups.map(group=>group.querySelector("summary")?.textContent?.replace(/\s+/g," ").trim())).toEqual([
    "Not submitted 1 deliverable",
    "Issued for Review (IFR) 2 deliverables",
    "Issued for Approval (IFA) 1 deliverable",
    "Issued for Design (IFD) 1 deliverable",
    "Issued for Construction (IFC) 1 deliverable",
  ]);
  for(const group of groups){
    expect(group.open).toBe(false);
    expect(group.hasAttribute("open")).toBe(false);
    expect(group.firstElementChild?.tagName).toBe("SUMMARY");
    expect(group.querySelector("summary")?.getAttribute("role")).toBeNull();
    expect(group.querySelector("summary")?.getAttribute("tabindex")).toBeNull();
    expect(group.querySelector("summary")?.className).toContain("min-h-11");
    expect(group.querySelector("summary button,summary a,summary input")).toBeNull();
  }
  expect(Array.from(groups[1].querySelectorAll("h3")).map(heading=>heading.textContent)).toEqual(["Deliverable review-first","Deliverable review-second"]);
  expect(groups[0].textContent).toContain("No revision submitted");
  expect(groups[1].textContent).toContain("Latest R02 · Issued for Review (IFR)");
});
it("uses independent native disclosures that can expand without changing deliverable routes",async()=>{
  state.documents=[makeDocument("unsubmitted"),makeDocument("review")];state.assignedIds=["unsubmitted","review"];
  state.revisions=[{document_id:"review",issue_status:"IFR",revision_code:"R01",state:"ready",control_status:"submitted"}];
  render(await page());
  const region=screen.getByRole("region",{name:"Submissions by issue purpose"});
  const groups=Array.from(region.querySelectorAll<HTMLDetailsElement>(":scope > details"));
  const summary=groups[1].querySelector("summary")!;
  summary.focus();expect(document.activeElement).toBe(summary);
  fireEvent.click(summary);
  expect(groups[1].open).toBe(true);expect(groups[0].open).toBe(false);
  expect(within(groups[1]).getByRole("link",{name:"Open deliverable"}).getAttribute("href")).toBe("/app/org/projects/project/documents/review#submit-revision");
  fireEvent.click(groups[0].querySelector("summary")!);
  expect(groups[0].open).toBe(true);expect(groups[1].open).toBe(true);
  expect(within(groups[0]).getByRole("link",{name:"Submit first revision"}).getAttribute("href")).toBe("/app/org/projects/project/documents/unsubmitted#submit-revision");
  fireEvent.click(summary);expect(groups[1].open).toBe(false);
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
  expect(submissions.textContent).toContain("Highest accepted progress: 100%");
  expect(submissions.textContent).not.toContain("Next revision required");
  expect(screen.getAllByText("100% at Issued for Design (IFD)").length).toBeGreaterThan(0);
  const progress=screen.getByRole("progressbar",{name:"Stage-weighted progress"});
  expect(progress.getAttribute("aria-valuemin")).toBe("0");
  expect(progress.getAttribute("aria-valuemax")).toBe("100");
  expect(progress.getAttribute("aria-valuenow")).toBe("100");
});

it("retains the highest accepted milestone while keeping the latest IFA submission and grouping visible",async()=>{
  state.hasDocument=true;
  state.revisions=[
    {id:"later-ifa",document_id:"doc",issue_status:"Issued for Approval (IFA)",revision_code:"A01",state:"ready",control_status:"accepted",created_at:"2026-10-16T12:00:00Z",reviewed_at:"2026-10-16T14:00:00Z"},
    {id:"earlier-ifd",document_id:"doc",issue_status:"Issued for Design (IFD)",revision_code:"IFD",state:"ready",control_status:"accepted",created_at:"2026-10-02T12:00:00Z",reviewed_at:"2026-10-02T14:00:00Z"},
  ];
  const before=JSON.stringify(state.revisions);
  render(await page("accepted"));
  const submissions=screen.getByRole("region",{name:"Submissions by issue purpose"});
  expect(submissions.querySelector("summary")?.textContent).toContain("Issued for Approval (IFA)");
  expect(submissions.textContent).toContain("Latest A01 · Issued for Approval (IFA)");
  expect(submissions.textContent).toContain("Highest accepted progress: 100%");
  expect(submissions.textContent).toContain("Stage accepted");
  expect(submissions.textContent).not.toContain("Next revision required");
  expect(screen.getByRole("progressbar",{name:"Stage-weighted progress"}).getAttribute("aria-valuenow")).toBe("100");
  expect(JSON.stringify(state.revisions)).toBe(before);
});

it("uses complete scoped progress when the latest-submission listing omits an earlier accepted milestone",async()=>{
  state.hasDocument=true;
  state.scheduleOverrides.doc={progress_credit:100,deadline_kind:"terminal_received",overdue:false};
  state.revisions=[{id:"later-ifa",document_id:"doc",issue_status:"Issued for Approval (IFA)",revision_code:"A01",state:"ready",control_status:"accepted"}];
  render(await page("accepted"));
  const submissions=screen.getByRole("region",{name:"Submissions by issue purpose"});
  expect(submissions.textContent).toContain("Latest A01 · Issued for Approval (IFA)");
  expect(submissions.textContent).toContain("Highest accepted progress: 100%");
  expect(submissions.textContent).toContain("Stage accepted");
  expect(screen.getByRole("progressbar",{name:"Stage-weighted progress"}).getAttribute("aria-valuenow")).toBe("100");
});

it.each([
  {state:"pending_upload",control_status:"accepted"},
  {state:"processing",control_status:"accepted"},
  {state:"failed",control_status:"accepted"},
  {state:"quarantined",control_status:"accepted"},
  {state:"ready",control_status:"submitted"},
  {state:"ready",control_status:"returned"},
  {state:"ready",control_status:"accepted",overridden_by_revision_id:"replacement"},
])("does not let an ineligible terminal revision change earned assignment progress: %j",async unsafe=>{
  state.hasDocument=true;
  state.revisions=[
    {id:"unsafe-ifd",document_id:"doc",issue_status:"Issued for Design (IFD)",revision_code:"IFD",...unsafe},
    {id:"accepted-ifa",document_id:"doc",issue_status:"Issued for Approval (IFA)",revision_code:"A01",state:"ready",control_status:"accepted"},
  ];
  render(await page());
  expect(screen.getByRole("progressbar",{name:"Stage-weighted progress"}).getAttribute("aria-valuenow")).toBe("67");
});

it("keeps the latest returned submission and its feedback actionable without losing earned accepted progress",async()=>{
  state.hasDocument=true;
  state.revisions=[
    {id:"returned-ifa",document_id:"doc",issue_status:"Issued for Approval (IFA)",revision_code:"A02",state:"ready",control_status:"returned",review_comment:"Resolve the cable schedule comments."},
    {id:"accepted-ifd",document_id:"doc",issue_status:"Issued for Design (IFD)",revision_code:"IFD",state:"superseded",control_status:"accepted"},
  ];
  render(await page("action"));
  const submissions=screen.getByRole("region",{name:"Submissions by issue purpose"});
  expect(submissions.textContent).toContain("Latest A02 · Issued for Approval (IFA)");
  expect(submissions.textContent).toContain("Resolve the cable schedule comments.");
  expect(submissions.textContent).toContain("Highest accepted progress: 100%");
  expect(screen.getByRole("progressbar",{name:"Stage-weighted progress"}).getAttribute("aria-valuenow")).toBe("100");
  fireEvent.click(submissions.querySelector("summary")!);
  expect(within(submissions).getByRole("link",{name:"Upload corrected revision"}).getAttribute("href")).toBe("/app/org/projects/project/documents/doc#submit-revision");
});

it("retains the direct request, upload and date-change routes and DCC feedback",async()=>{
  state.hasDocument=true;
  state.scheduleOverrides.doc={next_submission_date:"2026-11-20",planned_submission_date:"2026-11-20"};
  state.revisions=[{document_id:"doc",issue_status:"Issued for Review (IFR)",revision_code:"R01",state:"ready",control_status:"returned",review_comment:"Correct the equipment pressure schedule."}];
  render(await page());
  expect(screen.getByRole("link",{name:"Create request: date change or additional deliverable"}).getAttribute("href")).toBe("/app/org/projects/project/requests");
  const submissions=screen.getByRole("region",{name:"Submissions by issue purpose"});
  const issueGroup=submissions.querySelector(":scope > details");
  expect(issueGroup?.hasAttribute("open")).toBe(false);
  fireEvent.click(issueGroup!.querySelector("summary")!);
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
  expect(within(statuses).getByRole("link",{name:/Awaiting DCC.*1/})).toBeTruthy();
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
it("keeps deliverables available when recent notifications fail instead of presenting a false empty inbox",async()=>{
  state.hasDocument=true;state.failed="notifications";
  render(await page("action","Mechanical"));
  expect(screen.getByRole("heading",{level:1,name:"My deliverables"})).toBeTruthy();
  expect(within(screen.getByRole("region",{name:"Submissions by issue purpose"})).getByText("Mechanical design")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("Recent notifications could not be loaded");
  expect(screen.queryByText("No project notifications yet.")).toBeNull();
  expect(screen.getByRole("link",{name:"Retry notifications"}).getAttribute("href")).toBe("/app/org/projects/project/assignments?view=action&q=Mechanical#engineer-notifications");
  expect(document.body.textContent).not.toContain("private failure");
  expect(screen.getByRole("progressbar",{name:"Stage-weighted progress"}).getAttribute("aria-valuenow")).toBe("0");
});
it("separates latest purpose, DCC decision and retained accepted credit without implying transmission",async()=>{
  state.hasDocument=true;
  state.revisions=[
    {id:"latest",document_id:"doc",issue_status:"Issued for Approval (IFA)",revision_code:"A01",state:"ready",control_status:"accepted",created_at:"2026-10-16T12:00:00Z"},
    {id:"earned",document_id:"doc",issue_status:"Issued for Design (IFD)",revision_code:"IFD",state:"ready",control_status:"accepted",created_at:"2026-10-02T12:00:00Z"},
  ];
  const before=JSON.stringify(state.revisions);
  render(await page());
  const progress=screen.getByText("Highest accepted progress: 100%");
  const submission=screen.getByText("Latest A01 · Issued for Approval (IFA)");
  expect(screen.getByText("Latest submission")).toBeTruthy();expect(screen.getByText("Review status")).toBeTruthy();
  expect(screen.getByText("Accepted by DCC")).toBeTruthy();
  expect(progress.closest("details")).toBe(submission.closest("details"));
  expect(progress.closest("dd")?.textContent).toContain("Issued for Design (IFD)");
  expect(screen.queryByText(/Transmitted/)).toBeNull();
  expect(JSON.stringify(state.revisions)).toBe(before);
  expect(screen.getByRole("progressbar",{name:"Stage-weighted progress"}).getAttribute("aria-valuenow")).toBe("100");
});
it.each([
  {state:"ready",control_status:"submitted",label:"Awaiting DCC review"},
  {state:"processing",control_status:"accepted",label:"Security checks in progress"},
  {state:"failed",control_status:"accepted",label:"Security checks need attention"},
  {state:"processing",control_status:"submitted",label:"Security checks in progress"},
  {state:"failed",control_status:"submitted",label:"Security checks need attention"},
  {state:"ready",control_status:"returned",label:"Returned by DCC"},
])("names the actual latest-review state without changing status filters: $state / $control_status",async revision=>{
  state.hasDocument=true;
  state.revisions=[{document_id:"doc",issue_status:"Issued for Review (IFR)",revision_code:"R01",state:revision.state,control_status:revision.control_status}];
  render(await page());
  expect(screen.getByText(revision.label)).toBeTruthy();
  expect(screen.getByText("Latest R01 · Issued for Review (IFR)")).toBeTruthy();
  expect(screen.getByRole("progressbar",{name:"Stage-weighted progress"}).getAttribute("aria-valuenow")).toBe("0");
  expect(screen.getByRole("link",{name:/Awaiting DCC/}).textContent).toContain(revision.control_status==="submitted"?"1":"0");
});
it("does not label a legacy pending upload with default accepted status as DCC-accepted",async()=>{
  state.hasDocument=true;
  state.revisions=[{document_id:"doc",issue_status:"Issued for Review (IFR)",revision_code:"R01",state:"pending_upload",control_status:"accepted"}];
  render(await page());
  expect(screen.getByText("No revision submitted")).toBeTruthy();
  expect(screen.queryByText("Accepted by DCC")).toBeNull();
  expect(screen.getByRole("progressbar",{name:"Stage-weighted progress"}).getAttribute("aria-valuenow")).toBe("0");
});
