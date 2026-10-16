import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ResourcePlanForm} from "./project-management-forms";
import {AdminPreviewBoundary} from "./admin-preview-boundary";
import {upsertResourcePlan,type WorkflowState} from "@/app/app/workflow-actions";

vi.mock("@/app/app/workflow-actions",()=>({createProjectIssue:vi.fn(),updateProjectBrief:vi.fn(),upsertResourcePlan:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
const props={organisationId:"organisation-A",projectId:"project-A",disciplines:[{code:"ELE",name:"Electrical"},{code:"",name:"Instrumentation"}]};
beforeEach(()=>vi.clearAllMocks());
afterEach(cleanup);

describe("resource requirement editor",()=>{
  it.each([[undefined,true],[false,true],[true,false]])("preserves card defaults and embedded mode %s",(embedded,hasCard)=>{
    render(<ResourcePlanForm {...props} embedded={embedded}/>);
    const form=screen.getByRole("form",{name:"Plan discipline resources"}) as HTMLFormElement;
    expect(form.classList.contains("ev-card")).toBe(hasCard);
    expect(Object.fromEntries(new FormData(form))).toEqual({organisationId:"organisation-A",projectId:"project-A",discipline:"",requiredCount:"1",notes:""});
    expect((screen.getByLabelText("Discipline") as HTMLSelectElement).required).toBe(true);
    expect(screen.getByRole("option",{name:"ELE — Electrical"})).toBeTruthy();
    const count=screen.getByLabelText("Required engineers") as HTMLInputElement;
    expect(count.type).toBe("number");expect(count.required).toBe(true);expect(count.min).toBe("0");expect(count.max).toBe("100");
    expect((screen.getByLabelText("Notes") as HTMLInputElement).maxLength).toBe(500);
    expect(screen.getByRole("button",{name:"Save resource requirement"}).classList.contains("min-h-11")).toBe(true);
  });
  it("preserves selected discipline, count, optional notes and tenant scope when saving",async()=>{
    vi.mocked(upsertResourcePlan).mockResolvedValue({ok:true,message:"Resource requirement saved."});
    render(<ResourcePlanForm {...props} embedded/>);
    fireEvent.change(screen.getByLabelText("Discipline"),{target:{value:"Electrical"}});
    fireEvent.change(screen.getByLabelText("Required engineers"),{target:{value:"4"}});
    fireEvent.change(screen.getByLabelText("Notes"),{target:{value:"Two senior engineers"}});
    await act(async()=>{fireEvent.submit(screen.getByRole("form",{name:"Plan discipline resources"}));});
    expect(upsertResourcePlan).toHaveBeenCalledTimes(1);
    const [previous,data]=vi.mocked(upsertResourcePlan).mock.calls[0];
    expect(previous).toBeUndefined();expect(Object.fromEntries(data)).toEqual({organisationId:"organisation-A",projectId:"project-A",discipline:"Electrical",requiredCount:"4",notes:"Two senior engineers"});
    expect(screen.getByRole("status").textContent).toBe("Resource requirement saved.");
  });
  it("opens its parent disclosure for invalid input and returned server errors",async()=>{
    vi.mocked(upsertResourcePlan).mockResolvedValue({message:"Resource requirement could not be saved."});
    const {container}=render(<details><summary>Plan resources</summary><ResourcePlanForm {...props} embedded/></details>);
    const disclosure=container.querySelector("details")!;
    expect(disclosure.open).toBe(false);
    fireEvent.invalid(screen.getByLabelText("Discipline"));expect(disclosure.open).toBe(true);
    disclosure.open=false;
    await act(async()=>{fireEvent.submit(container.querySelector("form")!);});
    expect(disclosure.open).toBe(true);expect(screen.getByRole("alert").textContent).toBe("Resource requirement could not be saved.");
    expect(container.querySelector(".ev-card")).toBeNull();
  });
  it("announces a pending save and disables repeat submission",async()=>{
    let finish!:(value:WorkflowState)=>void;
    vi.mocked(upsertResourcePlan).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    render(<ResourcePlanForm {...props}/>);
    await act(async()=>{fireEvent.submit(screen.getByRole("form",{name:"Plan discipline resources"}));});
    expect(screen.getByRole("form",{name:"Plan discipline resources"}).getAttribute("aria-busy")).toBe("true");
    expect((screen.getByRole("button",{name:"Saving…"}) as HTMLButtonElement).disabled).toBe(true);
    await act(async()=>{finish({ok:true,message:"Resource requirement saved."});});
    expect(screen.getByRole("form",{name:"Plan discipline resources"}).getAttribute("aria-busy")).toBe("false");
  });
  it("explains missing disciplines and does not enable creation without them",()=>{
    render(<ResourcePlanForm {...props} disciplines={[]}/>);
    expect(screen.getByText("Add a project discipline before planning its resources.")).toBeTruthy();
    expect((screen.getByRole("button",{name:"Save resource requirement"}) as HTMLButtonElement).disabled).toBe(true);
    expect(upsertResourcePlan).not.toHaveBeenCalled();
  });
  it("keeps the resource editor read-only inside an audited preview",()=>{
    render(<AdminPreviewBoundary preview={{organisationId:"organisation-A",projectId:"project-A",role:"project_admin",displayName:"Project Manager",disciplines:[],expiresAt:"2099-01-01"}}><ResourcePlanForm {...props}/></AdminPreviewBoundary>);
    expect((screen.getByRole("button",{name:"Save resource requirement"}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Discipline") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Required engineers") as HTMLInputElement).disabled).toBe(true);
    expect(upsertResourcePlan).not.toHaveBeenCalled();
  });
});
