import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import ProgressPage from "./page";
import {requireProject} from "@/lib/auth";
import {loadProjectProgressData,type ProgressDeliveryRow,type ProgressProject} from "@/lib/project-progress-data";
import type {DeliveryCurveModel,DeliveryCurveReport} from "@/lib/project-delivery-curve";

const {workspaceProps}=vi.hoisted(()=>({workspaceProps:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/lib/project-progress-data",()=>({loadProjectProgressData:vi.fn()}));
vi.mock("@/components/project-progress-workspace",()=>({ProjectProgressWorkspace:(props:unknown)=>{
  workspaceProps(props);return <main><h1>Progress workspace loaded</h1></main>;
}}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>{throw new Error("Progress must not use a privileged fallback");}}));

type Data=Awaited<ReturnType<typeof loadProjectProgressData>>;
type Props={organisationId:string;projectId:string;project:ProgressProject;rows:ProgressDeliveryRow[];issues:Data["issues"];curve:DeliveryCurveModel;asOf:string;role:string;includeHistory:boolean};
const project:ProgressProject={code:"PRJ-001",name:"Refinery FEED",delivery_stage:"feed",planned_start_date:"2026-10-01",planned_end_date:"2026-12-01"};
const document:ProgressDeliveryRow={document_id:"document",document_number:"EL-001",title:"Electrical load list",discipline:"Electrical",progress_weight:1,progress_credit:33,uploaded:true,overdue:false,issue_status:"Issued for Review (IFR)",planned_submission_date:"2026-10-05",planned_final_date:"2026-11-01",next_submission_date:"2026-10-20",last_issue_date:"2026-10-15",revision_cycle_days:3,deadline_kind:"next_revision"};
const report:DeliveryCurveReport={id:"report",period_end:"2026-10-08",generated_at:"2026-10-09T10:00:00Z",snapshot:{summary:{overall_progress:20}}};
const ordinaryClient={from:vi.fn()},delegatedClient={from:vi.fn()};
let role:string,preview:unknown,data:Data;

beforeEach(()=>{
  vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  role="project_admin";preview=undefined;
  data={project,rows:[document],reports:[report],issues:[{id:"issue",severity:"high",status:"open"}],submissionProgress:{version:1,captured_at:"2026-10-15T11:59:59Z",submitted_progress:67,accepted_progress:33,total_deliverables:1,total_weight:1}};
  vi.mocked(requireProject).mockImplementation(async()=>({supabase:preview?delegatedClient:ordinaryClient,access:{role},preview} as never));
  vi.mocked(loadProjectProgressData).mockImplementation(async()=>data);
});
afterEach(()=>{cleanup();vi.useRealTimers();});
const page=()=>ProgressPage({params:Promise.resolve({organisationId:"org",projectId:"project"})});
const props=()=>workspaceProps.mock.lastCall?.[0] as Props;

it.each(["organisation_admin","project_admin","document_controller"])("loads %s progress with authorised whole-project saved report history",async allowedRole=>{
  role=allowedRole;
  render(await page());
  expect(requireProject).toHaveBeenCalledWith("org","project");
  expect(loadProjectProgressData).toHaveBeenCalledWith(ordinaryClient,"org","project",{includeHistory:true});
  expect(props()).toMatchObject({organisationId:"org",projectId:"project",role:allowedRole,includeHistory:true});
  expect(props().rows).toBe(data.rows);expect(props().project).toBe(project);
  expect(props().curve).toMatchObject({submittedToday:67,acceptedToday:33,gap:34,historyAvailable:true,acceptedHistoryCount:1,submittedHistoryCount:0});
  expect(props().curve.points.find(point=>point.date==="2026-10-08")).toMatchObject({submitted:null,accepted:20,acceptedSource:"report"});
});

it.each(["engineer","viewer","executive_viewer"])("preserves %s delegated access without fetching whole-project report history",async scopedRole=>{
  role=scopedRole;
  render(await page());
  expect(loadProjectProgressData).toHaveBeenCalledWith(ordinaryClient,"org","project",{includeHistory:false});
  expect(props().role).toBe(scopedRole);expect(props().includeHistory).toBe(false);
  expect(props().curve).toMatchObject({historyAvailable:false,acceptedHistoryCount:0,acceptedToday:33,submittedToday:null});
  // Even unexpected saved rows cannot bypass the role-controlled history flag.
  expect(props().curve.points.filter(point=>point.acceptedSource==="report")).toEqual([]);
});

it.each(["project_admin","document_controller","engineer"])("uses only the audited member client for a %s preview",async previewRole=>{
  role=previewRole;preview={sessionId:"preview-session",memberId:"member"};
  render(await page());
  expect(loadProjectProgressData).toHaveBeenCalledOnce();
  expect(loadProjectProgressData).toHaveBeenCalledWith(delegatedClient,"org","project",{includeHistory:previewRole!=="engineer"});
  expect(ordinaryClient.from).not.toHaveBeenCalled();expect(delegatedClient.from).not.toHaveBeenCalled();
});

it("does not load progress if authenticated project access rejects",async()=>{
  vi.mocked(requireProject).mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));
  await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");
  expect(loadProjectProgressData).not.toHaveBeenCalled();expect(workspaceProps).not.toHaveBeenCalled();
});

it.each(["project","rows"])("shows a generic retry state when mandatory %s data is unavailable",async source=>{
  if(source==="project")data.project=null;else data.rows=null;
  render(await page());
  expect(screen.getByRole("alert").textContent).toContain("Project progress could not be loaded.");
  expect(screen.getByRole("link",{name:"Retry progress"}).getAttribute("href")).toBe("/app/org/projects/project/progress");
  expect(workspaceProps).not.toHaveBeenCalled();
  expect(screen.queryByText(/0%|0 documents|No documents|supabase|railway|provider diagnostics/i)).toBeNull();
});

it.each([
  ["organisation_admin","overview"],["project_admin","overview"],["document_controller","control"],["engineer","assignments"],["viewer","documents"],
])("keeps a %s retry state's back link inside that role's own workspace",async(currentRole,destination)=>{
  role=currentRole;data.rows=null;
  render(await page());
  expect(screen.getByRole("link",{name:"Back to role workspace"}).getAttribute("href")).toBe(`/app/org/projects/project/${destination}`);
});

it("treats a successfully loaded empty MDR as real empty scope rather than a failed read",async()=>{
  data.rows=[];data.reports=[];data.issues=[];
  render(await page());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(props().rows).toEqual([]);
  expect(props().curve).toMatchObject({hasScope:false,acceptedToday:0,acceptedHistoryCount:0});
});

it("continues with the real live observation when saved report history is unavailable",async()=>{
  data.reports=null;
  render(await page());
  expect(props().curve).toMatchObject({historyAvailable:false,acceptedHistoryCount:0,acceptedToday:33});
  expect(props().curve.points.filter(point=>point.accepted!==null)).toEqual([expect.objectContaining({date:"2026-10-15",accepted:33,acceptedSource:"live"})]);
});

it("passes unknown issues through as null instead of inventing healthy zero issues",async()=>{
  data.issues=null;
  render(await page());
  expect(props().issues).toBeNull();expect(props().curve.acceptedToday).toBe(33);
});

it("does not backfill today's earned credit onto historical baseline dates",async()=>{
  data.reports=[];
  render(await page());
  expect(props().curve.points.find(point=>point.date==="2026-10-01")).toMatchObject({submitted:null,accepted:null,acceptedSource:null});
  expect(props().curve.points.filter(point=>point.accepted!==null)).toEqual([expect.objectContaining({date:"2026-10-15",accepted:33,acceptedSource:"live"})]);
});

it("timestamps the observation after scoped reads finish rather than at request start",async()=>{
  vi.mocked(loadProjectProgressData).mockImplementationOnce(async()=>{vi.setSystemTime(new Date("2026-10-15T12:02:00Z"));return data;});
  render(await page());
  expect(props().asOf).toBe("2026-10-15T12:02:00.000Z");
  expect(props().curve.asOf).toBe(props().asOf);
});

it("uses the Project Manager timeline, not first issue dates or revision cycles, as the chart basis",async()=>{
  data.rows=[{...document,planned_submission_date:null,planned_final_date:null,revision_cycle_days:null}];
  render(await page());
  expect(props().curve.timeline).toMatchObject({status:"configured",plannedStart:"2026-10-01",plannedEnd:"2026-12-01",displayStart:"2026-10-01",displayEnd:"2026-12-01"});
  expect(props().curve).toMatchObject({submittedToday:67,acceptedToday:33});
  expect(props().curve).not.toHaveProperty("planning");expect(props().curve).not.toHaveProperty("plannedToday");
});

it("does not invent project dates when the Project Manager timeline is missing",async()=>{
  data.project={...project,planned_start_date:null,planned_end_date:null};
  render(await page());expect(props().curve.timeline.status).toBe("missing");
  expect(props().curve).toMatchObject({submittedToday:67,acceptedToday:33});
});

it("keeps accepted progress available when the restricted submission aggregate is unavailable",async()=>{
  data.submissionProgress=null;render(await page());
  expect(props().curve).toMatchObject({submittedToday:null,acceptedToday:33,gap:null});
});

it("retains the PM end date while displaying real delivery after that date",async()=>{
  data.project={...project,planned_end_date:"2026-10-09"};render(await page());
  expect(props().curve.timeline).toMatchObject({plannedEnd:"2026-10-09",displayEnd:"2026-10-15"});
  expect(props().curve.points.find(point=>point.date==="2026-10-15")).toMatchObject({submitted:67,accepted:33});
});
