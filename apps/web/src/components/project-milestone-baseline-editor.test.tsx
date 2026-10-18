import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {ProjectMilestoneBaselineEditor} from "./project-milestone-baseline-editor";
import type {MilestoneBaselineState} from "@/app/app/milestone-baseline-actions";
import type {ProjectMilestoneBaselineEditor as EditorData} from "@/lib/project-milestone-baseline";

const hook=vi.hoisted(()=>({state:{} as MilestoneBaselineState,pending:false,action:vi.fn(),refresh:vi.fn()}));
vi.mock("react",async load=>({...await load<typeof import("react")>(),useActionState:()=>[hook.state,hook.action,hook.pending]}));
vi.mock("@/app/app/milestone-baseline-actions",()=>({approveMilestoneBaseline:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:hook.refresh})}));
const base:EditorData={scope_hash:"scope",current_baseline_id:null,baseline_version:null,planned_start_date:"2026-10-01",planned_end_date:"2026-11-01",delivery_stage:"feed",revision_cycle_days:3,documents:[{document_id:"a0000000-0000-4000-8000-000000000001",document_number:"DOC-001",title:"Electrical index",discipline:"Electrical",progress_weight:2,planned_submission_date:"2026-10-05",planned_final_date:"2026-10-20",milestones:[{issue_status:"IFR",planned_date:"2026-10-05"},{issue_status:"IFA",planned_date:"2026-10-12"},{issue_status:"IFD",planned_date:"2026-10-20"}]}]};
function mount(editor=base){return render(<ProjectMilestoneBaselineEditor organisationId="org" projectId="project" editor={editor}/>);}
beforeEach(()=>{hook.state={};hook.pending=false;hook.action.mockReset();hook.refresh.mockReset();});
afterEach(()=>{expect(hook.action).not.toHaveBeenCalled();cleanup();});

describe("weighted milestone baseline editor",()=>{
  it("keeps discipline folders collapsed, labels every date and retains weights read-only",()=>{
    const {container}=mount();const folder=container.querySelector("details")!;expect(folder.open).toBe(false);expect(folder.querySelector("summary")?.textContent).toContain("Electrical");
    fireEvent.click(folder.querySelector("summary")!);
    const date=screen.getByLabelText("IFR date for DOC-001") as HTMLInputElement;expect(date.type).toBe("date");expect(date.value).toBe("2026-10-05");expect(date.min).toBe("2026-10-01");expect(date.max).toBe("2026-11-01");
    expect(screen.getByText("Weight 2")).toBeTruthy();expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByText("All deliverable dates are complete")).toBeTruthy();
  });
  it("requires a reason and explicit confirmation before approval becomes available",()=>{
    mount();const button=screen.getByRole("button",{name:"Approve milestone baseline"}) as HTMLButtonElement;expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Approval reason"),{target:{value:"Agreed weighted milestone plan"}});expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));expect(button.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("IFA date for DOC-001"),{target:{value:"2026-10-13"}});expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);expect(button.disabled).toBe(true);
  });
  it("serialises all deliverables, never just filtered or paginated rows",()=>{
    const documents=Array.from({length:45},(_,index)=>({...base.documents[0],document_id:`a0000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`,document_number:`DOC-${String(index+1).padStart(3,"0")}`}));
    const {container}=mount({...base,documents});expect(screen.getByText("1–40 of 45 deliverables")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Next"}));expect(screen.getByText("41–45 of 45 deliverables")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox",{name:"Search baseline deliverables"}),{target:{value:"DOC-045"}});
    const form=container.querySelector("form")!;const payload=JSON.parse(String(new FormData(form).get("plannedMilestones")));expect(payload).toHaveLength(45);expect(payload[44].document_id).toBe(documents[44].document_id);expect(Object.keys(payload[0])).toEqual(["document_id","milestones"]);
    expect(screen.getByText("1–1 of 1 deliverables")).toBeTruthy();expect(container.querySelector("details")!.open).toBe(true);
  });
  it("does not permit approval when an invisible filtered row is incomplete",()=>{
    const incomplete={...base.documents[0],document_id:"a0000000-0000-4000-8000-000000000002",document_number:"OTHER",milestones:base.documents[0].milestones.map(milestone=>({...milestone,planned_date:null}))};
    mount({...base,documents:[base.documents[0],incomplete]});
    fireEvent.change(screen.getByRole("searchbox"),{target:{value:"DOC-001"}});expect(screen.getByText("OTHER: set the IFR date.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Approval reason"),{target:{value:"Agreed complete milestone plan"}});fireEvent.click(screen.getByRole("checkbox"));expect((screen.getByRole("button",{name:"Approve milestone baseline"}) as HTMLButtonElement).disabled).toBe(true);
  });
  it("never fabricates suggested dates when none exist",()=>{mount({...base,documents:[{...base.documents[0],milestones:base.documents[0].milestones.map(milestone=>({...milestone,planned_date:null}))}]});expect((screen.getByLabelText("IFR date for DOC-001") as HTMLInputElement).value).toBe("");expect(screen.getByText("DOC-001: set the IFR date.")).toBeTruthy();});
  it("keeps search and pagination out of the submitted approval payload",()=>{const {container}=mount();const fields=Object.fromEntries(new FormData(container.querySelector("form")!));expect(Object.keys(fields).sort()).toEqual(["approvalReason","expectedBaseline","expectedScopeHash","organisationId","plannedMilestones","projectId"].sort());});
  it("shows truthful no-match feedback and retains complete approval payload",()=>{mount();fireEvent.change(screen.getByRole("searchbox"),{target:{value:"no such document"}});expect(screen.getByText("No matching deliverables.")).toBeTruthy();expect(screen.getByText("0 deliverables")).toBeTruthy();});
  it("reloads server scope explicitly without approving or automatically saving",()=>{mount();fireEvent.click(screen.getByRole("button",{name:"Reload latest plan"}));expect(hook.refresh).toHaveBeenCalledExactlyOnceWith();});
  it("freezes mutation inputs while approval is pending",()=>{hook.pending=true;mount();expect((screen.getByLabelText("Approval reason") as HTMLTextAreaElement).disabled).toBe(true);expect((screen.getByRole("button",{name:"Approving baseline…"}) as HTMLButtonElement).disabled).toBe(true);expect(screen.getByRole("form").getAttribute("aria-busy")).toBe("true");});
  it("announces approval failure without claiming that the plan was saved",()=>{hook.state={message:"Approval could not be confirmed."};mount();expect(screen.getByRole("alert").textContent).toBe("Approval could not be confirmed.");expect(screen.getByRole("button",{name:"Approve milestone baseline"})).toBeTruthy();});
  it("locks the approved form to prevent resubmitting a stale version",()=>{hook.state={ok:true,message:"Baseline approved."};mount();expect(screen.getByRole("status").textContent).toBe("Baseline approved.");expect(screen.queryByRole("button",{name:"Approve milestone baseline"})).toBeNull();expect(screen.getByRole("link",{name:"Return to progress & health"}).getAttribute("href")).toContain("/progress");expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);});
});
