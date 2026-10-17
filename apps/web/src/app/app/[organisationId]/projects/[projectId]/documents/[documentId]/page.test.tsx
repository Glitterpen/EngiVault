import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import DocumentPage from "./page";
import {requireProject} from "@/lib/auth";
import {loadDocumentSchedules} from "@/lib/document-schedule";
import {RevisionUpload} from "@/components/revision-upload";
import {RevisionCompare} from "@/components/revision-compare";
import {DocumentAssignmentManager} from "@/components/document-assignment-manager";

vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/lib/document-schedule",()=>({loadDocumentSchedules:vi.fn()}));
vi.mock("next/navigation",()=>({
  redirect:vi.fn((path:string)=>{throw new Error(`NEXT_REDIRECT:${path}`);}),
  notFound:vi.fn(()=>{throw new Error("NEXT_NOT_FOUND");}),
}));
vi.mock("@/components/revision-upload",()=>({RevisionUpload:vi.fn(()=><section aria-label="Upload revision form"><h2>Upload revision</h2></section>)}));
vi.mock("@/components/incomplete-upload-recovery",()=>({IncompleteUploadRecovery:({endpoint}:{endpoint:string})=><div data-testid="incomplete-recovery" data-endpoint={endpoint}>Resume incomplete submission</div>}));
vi.mock("@/components/revision-processing-status",()=>({RevisionProcessingStatus:({endpoint,initialRevisionState,canRetry}:{endpoint:string;initialRevisionState:string;canRetry:boolean})=><div data-testid="revision-processing" data-endpoint={endpoint} data-can-retry={String(canRetry)}>{initialRevisionState}</div>}));
vi.mock("@/components/revision-compare",()=>({RevisionCompare:vi.fn(({revisions}:{revisions:{id:string}[]})=>revisions.length>=2?<div data-testid="revision-comparison">Compare ready revisions</div>:null)}));
vi.mock("@/components/record-admin-forms",()=>({DocumentAdminForm:()=> <div data-testid="document-admin">Manage registration</div>}));
vi.mock("@/components/document-plan-form",()=>({DocumentPlanForm:()=> <div data-testid="document-plan">Manage dates</div>}));
vi.mock("@/components/document-assignment-manager",()=>({DocumentAssignmentManager:vi.fn(()=><div data-testid="document-assignment">Manage assignments</div>)}));
vi.mock("@/components/document-issue-schedule",()=>({DocumentIssueSchedule:()=> <div data-testid="document-schedule">First issue: 01 Oct 2026</div>}));

type Revision={
  id:string;uploaded_by:string;revision_code:string;issue_status:string;issue_date:string|null;
  state:string;original_filename:string;byte_size:number;native_original_filename:string|null;
  native_byte_size:number|null;created_at:string;reviewed_at:string|null;control_status:string;review_comment:string|null;
  submission_version:number;overridden_by_revision_id:string|null;
};
type QueryRead={table:string;selection:string;filters:[string,unknown][];order?:[string,{ascending:boolean}];values?:[string,string[]]};
type Query={
  select:(selection:string)=>Query;eq:(column:string,value:unknown)=>Query;
  in:(column:string,values:string[])=>Query;order:(column:string,options:{ascending:boolean})=>Query;
  maybeSingle:()=>Promise<{data:unknown}>;then:Promise<{data:unknown}>["then"];
};
const params={organisationId:"org",projectId:"project",documentId:"doc"};
const base="/api/v1/organisations/org/projects/project/documents/doc";
const doc={id:"doc",organisation_id:"org",project_id:"project",document_number:"ENG-PROC-001",title:"Process design basis",discipline:"Process",document_type:"Design basis",status:"Draft",lifecycle_status:"active",required_issue_status:"Issued for Design (IFD)"};
const schedule={document_id:"doc",planned_submission_date:"2026-10-01",next_submission_date:"2026-10-07",last_issue_date:"2026-10-02",revision_cycle_days:3,deadline_kind:"next_revision" as const,overdue:false};
const engineer={user_id:"engineer",display_name:"Process Engineer",email:"engineer@example.test",role:"engineer",disciplines:["Process"]};
const revision=(overrides:Partial<Revision>={}):Revision=>({
  id:"revision",uploaded_by:"engineer",revision_code:"R01",issue_status:"Issued for Review (IFR)",issue_date:"2026-10-01",
  state:"ready",original_filename:"process-design.pdf",byte_size:2048,native_original_filename:null,native_byte_size:null,
  created_at:"2026-10-01T12:00:00Z",reviewed_at:null,control_status:"accepted",review_comment:null,submission_version:1,overridden_by_revision_id:null,...overrides,
});

let role:string,preview:unknown,documentExists:boolean,disciplineAccess:boolean,deliveryStage:string|null;
let revisions:Revision[],team:typeof engineer[],assignments:{user_id:string;status:string}[],runs:Record<string,unknown>[];
let reads:QueryRead[];
const from=vi.fn(),rpc=vi.fn();
beforeEach(()=>{
  vi.clearAllMocks();
  role="engineer";preview=null;documentExists=true;disciplineAccess=true;deliveryStage="feed";
  revisions=[];team=[engineer];assignments=[];runs=[];reads=[];
  rpc.mockImplementation(async(name:string)=>({data:name==="can_upload_document"?disciplineAccess:name==="get_project_team"?team:[]}));
  from.mockImplementation((table:string)=>{
    const read:QueryRead={table,selection:"",filters:[]};reads.push(read);
    const data=table==="documents"?(documentExists?doc:null):table==="projects"?{delivery_stage:deliveryStage}:table==="document_revisions"?revisions:table==="document_assignments"?assignments:table==="processing_runs"?runs:[];
    const promise=Promise.resolve({data});
    const query:Query={
      select:selection=>{read.selection=selection;return query;},
      eq:(column,value)=>{read.filters.push([column,value]);return query;},
      in:(column,values)=>{read.values=[column,values];return query;},
      order:(column,options)=>{read.order=[column,options];return query;},
      maybeSingle:()=>promise,then:promise.then.bind(promise),
    };
    return query;
  });
  vi.mocked(requireProject).mockImplementation(async()=>({supabase:{from,rpc},access:{role},user:{id:"engineer"},preview} as never));
  vi.mocked(loadDocumentSchedules).mockResolvedValue(new Map([["doc",schedule]]));
});
afterEach(()=>cleanup());
const page=()=>DocumentPage({params:Promise.resolve(params)});
const renderPage=async()=>render(await page());

describe("document route scope and role controls",()=>{
  it("requires project authority and scopes the document, project and schedule reads",async()=>{
    await renderPage();
    expect(requireProject).toHaveBeenCalledWith("org","project");
    expect(reads.find(read=>read.table==="documents")?.filters).toEqual([["id","doc"],["organisation_id","org"],["project_id","project"]]);
    expect(reads.find(read=>read.table==="projects")?.filters).toEqual([["organisation_id","org"],["id","project"]]);
    expect(loadDocumentSchedules).toHaveBeenCalledWith(expect.anything(),"org","project",["doc"]);
    expect(rpc).toHaveBeenCalledWith("can_upload_document",{org:"org",project:"project",document:"doc"});
    expect(screen.getByRole("heading",{level:1,name:doc.title})).toBeTruthy();
    expect(screen.getByText(/ENG-PROC-001/)).toBeTruthy();
  });
  it.each(["organisation_admin","project_admin"])("redirects %s to its own dashboard before document queries",async managementRole=>{
    role=managementRole;
    await expect(page()).rejects.toThrow("NEXT_REDIRECT:/app/org/projects/project/overview");
    expect(from).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();expect(loadDocumentSchedules).not.toHaveBeenCalled();
  });
  it("does not render an unavailable document",async()=>{
    documentExists=false;
    await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loadDocumentSchedules).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
  });
  it("does not grant an engineer document access from a route alone",async()=>{
    disciplineAccess=false;
    await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(reads.map(read=>read.table)).not.toContain("document_revisions");
    expect(reads.map(read=>read.table)).not.toContain("document_assignments");
  });
  it("keeps engineer upload visible without DCC management or team reads",async()=>{
    await renderPage();
    expect(screen.getByRole("region",{name:"Upload revision form"})).toBeTruthy();
    expect(screen.queryByTestId("document-admin")).toBeNull();expect(screen.queryByTestId("document-plan")).toBeNull();expect(screen.queryByTestId("document-assignment")).toBeNull();
    expect(screen.queryByRole("link",{name:/Open submission review/})).toBeNull();
    expect(rpc).not.toHaveBeenCalledWith("get_project_team",expect.anything());
    expect(reads.map(read=>read.table)).not.toContain("document_assignments");
    expect(screen.getByRole("link",{name:"My deliverables"}).getAttribute("href")).toBe("/app/org/projects/project/assignments");
  });
  it("keeps DCC management, planning, discipline assignments and review access",async()=>{
    role="document_controller";
    team=[engineer,{...engineer,user_id:"other-discipline",disciplines:["Electrical"]},{...engineer,user_id:"manager",role:"project_admin"}];
    assignments=[{user_id:"engineer",status:"active"}];
    await renderPage();
    expect(screen.getByTestId("document-admin")).toBeTruthy();expect(screen.getByTestId("document-plan")).toBeTruthy();expect(screen.getByTestId("document-assignment")).toBeTruthy();
    expect(screen.queryByRole("region",{name:"Upload revision form"})).toBeNull();
    expect(screen.getByRole("link",{name:/Open submission review/}).getAttribute("href")).toBe("/app/org/projects/project/reviews");
    expect(rpc).toHaveBeenCalledWith("get_project_team",{target_organisation:"org",target_project:"project"});
    expect(vi.mocked(DocumentAssignmentManager).mock.calls[0][0]).toMatchObject({organisationId:"org",projectId:"project",documentId:"doc",discipline:"Process",engineers:[{userId:"engineer",name:engineer.display_name,email:engineer.email,assigned:true}]});
    expect(reads.find(read=>read.table==="document_assignments")?.filters).toEqual([["organisation_id","org"],["project_id","project"],["document_id","doc"]]);
  });
  it("does not mistake a removed assignment for current assignment",async()=>{
    role="document_controller";assignments=[{user_id:"engineer",status:"removed"}];
    await renderPage();
    expect(vi.mocked(DocumentAssignmentManager).mock.calls[0][0].engineers[0].assigned).toBe(false);
  });
  it("leaves a viewer read-only without upload or DCC controls",async()=>{
    role="viewer";
    await renderPage();
    expect(screen.queryByRole("region",{name:"Upload revision form"})).toBeNull();
    expect(screen.queryByTestId("document-admin")).toBeNull();expect(screen.queryByTestId("document-assignment")).toBeNull();expect(screen.queryByTestId("incomplete-recovery")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("keeps the upload anchor and places submission before revision history for engineers",async()=>{
    await renderPage();
    const upload=screen.getByRole("region",{name:"Upload revision form"});
    expect(upload.closest("#submit-revision")).toBeTruthy();
    expect(upload.compareDocumentPosition(screen.getByRole("heading",{name:"Revision history"}))&Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });
});

describe("incomplete upload ownership and recovery",()=>{
  it("labels an incomplete registration without implying it has entered DCC review",async()=>{
    revisions=[revision({state:"pending_upload",control_status:"submitted"})];
    await renderPage();
    expect(screen.getByText("Upload incomplete")).toBeTruthy();
    expect(screen.getByText("Not yet in DCC review. Complete the upload before the submission can proceed.")).toBeTruthy();
    expect(screen.queryByText("submitted",{exact:true})).toBeNull();
    expect(screen.getByTestId("revision-processing")).toHaveProperty("textContent","pending_upload");
    expect(revisions[0]).toMatchObject({state:"pending_upload",control_status:"submitted"});
    expect(screen.getByTestId("incomplete-recovery")).toBeTruthy();
  });
  it("keeps the incomplete-upload explanation in read-only engineer preview without offering recovery",async()=>{
    preview={id:"audited-preview"};revisions=[revision({state:"pending_upload",control_status:"submitted"})];
    await renderPage();
    expect(screen.getByText("Upload incomplete")).toBeTruthy();
    expect(screen.getByText(/Not yet in DCC review/)).toBeTruthy();
    expect(screen.queryByTestId("incomplete-recovery")).toBeNull();
  });
  it.each(["submitted","accepted","returned"])("retains the %s decision label once upload has completed",async control_status=>{
    revisions=[revision({state:"ready",control_status})];
    await renderPage();
    expect(screen.getByText(control_status,{exact:true})).toBeTruthy();
    expect(screen.queryByText("Upload incomplete")).toBeNull();
    expect(screen.queryByText(/Not yet in DCC review/)).toBeNull();
  });
  it("keeps the original engineer's pending recovery visible before the normal uploader",async()=>{
    revisions=[revision({state:"pending_upload",control_status:"submitted"})];
    await renderPage();
    const recovery=screen.getByTestId("incomplete-recovery");
    expect(recovery.getAttribute("data-endpoint")).toBe(`${base}/revisions/revision/recovery`);
    expect(recovery.closest("details")).toBeNull();
    expect(recovery.compareDocumentPosition(screen.getByRole("region",{name:"Upload revision form"}))&Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });
  it.each([
    {state:"ready",control_status:"submitted",uploaded_by:"engineer"},
    {state:"ready",control_status:"accepted",uploaded_by:"engineer"},
    {state:"superseded",control_status:"accepted",uploaded_by:"engineer"},
    {state:"quarantined",control_status:"submitted",uploaded_by:"engineer"},
    {state:"processing",control_status:"submitted",uploaded_by:"engineer"},
    {state:"failed",control_status:"submitted",uploaded_by:"engineer"},
    {state:"pending_upload",control_status:"accepted",uploaded_by:"engineer"},
    {state:"pending_upload",control_status:"returned",uploaded_by:"engineer"},
    {state:"pending_upload",control_status:"submitted",uploaded_by:"someone-else"},
  ])("does not offer recovery for $state / $control_status / $uploaded_by",async values=>{
    revisions=[revision(values)];
    await renderPage();
    expect(screen.queryByTestId("incomplete-recovery")).toBeNull();
  });
  it("does not offer recovery in audited engineer preview",async()=>{
    preview={id:"audited-preview"};revisions=[revision({state:"pending_upload",control_status:"submitted"})];
    await renderPage();
    expect(screen.queryByTestId("incomplete-recovery")).toBeNull();
    // Existing form rendering is kept; AdminPreviewBoundary locks its controls.
    expect(screen.getByRole("region",{name:"Upload revision form"})).toBeTruthy();
  });
  it.each(["document_controller","viewer"])("does not offer another engineer's recovery to %s",async currentRole=>{
    role=currentRole;revisions=[revision({state:"pending_upload",control_status:"submitted"})];
    await renderPage();
    expect(screen.queryByTestId("incomplete-recovery")).toBeNull();
  });
});

describe("revision history and secure file actions",()=>{
  it("requests newest-first history and reads processing only for the returned revision IDs",async()=>{
    revisions=[revision({id:"latest",revision_code:"A01",created_at:"2026-10-08T12:00:00Z"}),revision({id:"earlier",revision_code:"R01"})];
    await renderPage();
    expect(reads.find(read=>read.table==="document_revisions")).toMatchObject({filters:[["document_id","doc"]],order:["created_at",{ascending:false}]});
    expect(reads.find(read=>read.table==="processing_runs")?.values).toEqual(["revision_id",["latest","earlier"]]);
    expect(screen.getByText("Revision A01").compareDocumentPosition(screen.getByText("Revision R01"))&Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });
  it.each([
    {state:"ready",preview:true,download:true},
    {state:"superseded",preview:false,download:true},
    {state:"pending_upload",preview:false,download:false},
    {state:"quarantined",preview:false,download:false},
    {state:"processing",preview:false,download:false},
    {state:"failed",preview:false,download:false},
  ])("preserves secure file actions for $state revisions",async row=>{
    revisions=[revision({state:row.state,native_original_filename:"process-design.docx",native_byte_size:4096})];
    await renderPage();
    const previewLink=screen.queryByRole("link",{name:"Preview revision R01"});
    const download=screen.queryByRole("link",{name:"Download revision R01"});
    const native=screen.queryByRole("link",{name:"Download native source for revision R01"});
    expect(Boolean(previewLink)).toBe(row.preview);expect(Boolean(download)).toBe(row.download);expect(Boolean(native)).toBe(row.download);
    if(previewLink)expect(previewLink.getAttribute("href")).toBe("/app/org/projects/project/documents/doc/revisions/revision/preview");
    if(download)expect(download.getAttribute("href")).toBe(`${base}/revisions/revision/download`);
    if(native)expect(native.getAttribute("href")).toBe(`${base}/revisions/revision/native-download`);
  });
  it("does not offer a native download when no native source exists",async()=>{
    revisions=[revision()];await renderPage();
    expect(screen.queryByRole("link",{name:/Download native source/})).toBeNull();
  });
  it("keeps issue purpose, filenames, submission version and DCC feedback visible",async()=>{
    revisions=[revision({control_status:"returned",review_comment:"Correct the drawing title before resubmitting.",native_original_filename:"source.docx",native_byte_size:4096,submission_version:2})];
    await renderPage();
    expect(screen.getByText(/process-design.pdf/)).toBeTruthy();expect(screen.getByText(/source.docx/)).toBeTruthy();
    expect(screen.getByText(/Issued for Review \(IFR\)/)).toBeTruthy();expect(screen.getByText("Submission 2")).toBeTruthy();
    const feedback=screen.getByText(/Correct the drawing title before resubmitting/);
    expect(feedback.closest("details")).toBeNull();expect(screen.getByText("returned")).toBeTruthy();
  });
  it("keeps processing status tied to its original endpoint and DCC retry gate",async()=>{
    role="document_controller";revisions=[revision({state:"processing",control_status:"submitted"})];
    await renderPage();
    const processing=screen.getByTestId("revision-processing");
    expect(processing.getAttribute("data-endpoint")).toBe(`${base}/revisions/revision/processing`);
    expect(processing.getAttribute("data-can-retry")).toBe("true");expect(processing.closest("details")).toBeNull();
  });
  it.each(["engineer","viewer"])("does not grant processing retry to %s",async currentRole=>{
    role=currentRole;revisions=[revision({state:"failed"})];await renderPage();
    expect(screen.getByTestId("revision-processing").getAttribute("data-can-retry")).toBe("false");
  });
  it("keeps overridden audit information without mounting its active processing controls",async()=>{
    revisions=[revision({overridden_by_revision_id:"replacement"})];await renderPage();
    expect(screen.getByText("Overridden")).toBeTruthy();expect(screen.getByText(/Original file retained for audit history/)).toBeTruthy();
    expect(screen.queryByTestId("revision-processing")).toBeNull();
  });
  it.each([
    {metrics:{page_count:2},message:"2 pages extracted"},
    {metrics:{sheet_count:1},message:"1 sheet extracted"},
    {metrics:{mode:"validation_only"},message:"Validated original · CAD extraction pending"},
  ])("preserves processing summary $message",async row=>{
    revisions=[revision()];runs=[{revision_id:"revision",state:"ready",attempt:1,error_code:null,metrics:row.metrics,updated_at:"2026-10-01"}];
    await renderPage();expect(screen.getByText(row.message)).toBeTruthy();
  });
  it("uses the useful customer-facing error instead of exposing the processing reference",async()=>{
    revisions=[revision()];runs=[{revision_id:"revision",state:"failed",attempt:1,error_code:"PROCESSOR_ERROR",metrics:null,updated_at:"2026-10-01"}];
    await renderPage();
    expect(screen.queryByText("PROCESSOR_ERROR")).toBeNull();
    expect(screen.getByTestId("revision-processing")).toBeTruthy();
  });
  it("shows an empty history without making an unnecessary processing read",async()=>{
    await renderPage();
    expect(screen.getByText("No revisions uploaded.")).toBeTruthy();
    expect(reads.map(read=>read.table)).not.toContain("processing_runs");
  });
});

describe("milestone and comparison inputs",()=>{
  it("counts only complete DCC-accepted issue purposes for the controlled sequence",async()=>{
    revisions=[
      revision({id:"ready-submitted",control_status:"submitted"}),
      revision({id:"ready-accepted-review"}),
      revision({id:"superseded-accepted",state:"superseded",issue_status:"Issued for Approval (IFA)"}),
      revision({id:"duplicate-ready",issue_status:"Issued for Approval (IFA)"}),
      revision({id:"pending",state:"pending_upload",control_status:"submitted",issue_status:"Issued for Design (IFD)"}),
      revision({id:"returned",control_status:"returned",issue_status:"Issued for Construction (IFC)"}),
      revision({id:"failed",state:"failed",issue_status:"Issued for Design (IFD)"}),
      revision({id:"processing",state:"processing",issue_status:"Issued for Design (IFD)"}),
      revision({id:"overridden",issue_status:"Issued for Design (IFD)",overridden_by_revision_id:"replacement"}),
    ];
    await renderPage();
    expect(vi.mocked(RevisionUpload).mock.calls[0][0]).toMatchObject({organisationId:"org",projectId:"project",documentId:"doc",deliveryStage:"feed",completedIssueStatuses:["Issued for Review (IFR)","Issued for Approval (IFA)"]});
    expect(vi.mocked(RevisionUpload).mock.calls[0][0].completedIssueRevisions).toEqual(revisions.slice(1,4).map(row=>({issue_status:row.issue_status,created_at:row.created_at,reviewed_at:row.reviewed_at,control_status:row.control_status,state:row.state,overridden_by_revision_id:row.overridden_by_revision_id})));
  });
  it("does not pass ready IFR or IFA records awaiting DCC acceptance as prerequisites",async()=>{
    revisions=[revision({id:"ifr",control_status:"submitted"}),revision({id:"ifa",issue_status:"Issued for Approval (IFA)",control_status:"submitted"})];
    await renderPage();
    expect(vi.mocked(RevisionUpload).mock.calls[0][0].completedIssueStatuses).toEqual([]);
    expect(vi.mocked(RevisionUpload).mock.calls[0][0].completedIssueRevisions).toEqual([]);
    expect(revisions.every(row=>row.control_status==="submitted")).toBe(true);
  });
  it.each(["feed","ded"])("passes the actual %s delivery stage to upload validation",async stage=>{
    deliveryStage=stage;await renderPage();
    expect(vi.mocked(RevisionUpload).mock.calls[0][0].deliveryStage).toBe(stage);
  });
  it("retains the FEED fallback when project delivery stage is not set",async()=>{
    deliveryStage=null;await renderPage();expect(vi.mocked(RevisionUpload).mock.calls[0][0].deliveryStage).toBe("feed");
  });
  it("keeps comparison ready-only without changing endpoints or revision order",async()=>{
    revisions=[revision({id:"ready-one"}),revision({id:"pending",state:"pending_upload"}),revision({id:"superseded",state:"superseded"}),revision({id:"ready-two",revision_code:"A01"})];
    await renderPage();
    expect(vi.mocked(RevisionCompare).mock.calls[0][0]).toMatchObject({endpoint:`${base}/comparisons`,revisions:[revisions[0],revisions[3]]});
    expect(screen.getByTestId("revision-comparison")).toBeTruthy();
  });
  it("keeps schedule details mounted in a collapsed native disclosure",async()=>{
    await renderPage();
    const details=screen.getByTestId("document-schedule").closest("details");
    expect(details).toBeTruthy();expect(details?.open).toBe(false);
  });
  it("keeps the next submission date visible in the closed schedule summary",async()=>{
    await renderPage();
    const summary=screen.getByText("Next due · 07 Oct 2026").closest("summary");
    expect(summary).toBeTruthy();
    expect(summary?.parentElement).toBe(screen.getByTestId("document-schedule").closest("details"));
    expect((summary?.parentElement as HTMLDetailsElement).open).toBe(false);
  });
  it("keeps an overdue submission warning visible without opening schedule details",async()=>{
    vi.mocked(loadDocumentSchedules).mockResolvedValueOnce(new Map([["doc",{...schedule,overdue:true}]]));
    await renderPage();
    const summary=screen.getByText("Overdue · 07 Oct 2026").closest("summary");
    expect(summary).toBeTruthy();
    expect((summary?.parentElement as HTMLDetailsElement).open).toBe(false);
    expect(screen.queryByText("Next due · 07 Oct 2026")).toBeNull();
  });
  it("keeps an unset revision-cycle warning visible in the initially closed summary",async()=>{
    vi.mocked(loadDocumentSchedules).mockResolvedValueOnce(new Map([["doc",{...schedule,next_submission_date:null,revision_cycle_days:null,deadline_kind:"cycle_not_set" as const}]]));
    await renderPage();
    const summary=screen.getByText("Revision cycle not set").closest("summary");
    expect(summary).toBeTruthy();
    expect((summary?.parentElement as HTMLDetailsElement).open).toBe(false);
    expect(screen.queryByText(/^Next due ·/)).toBeNull();
  });
});
