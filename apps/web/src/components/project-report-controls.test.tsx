import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {ProjectReportControls} from "./project-report-controls";
import {AdminPreviewBoundary} from "./admin-preview-boundary";
import type {ProjectReportActionState} from "@/app/app/project-report-actions";

const mocks=vi.hoisted(()=>({generate:vi.fn(),save:vi.fn(),router:{push:vi.fn(),refresh:vi.fn()}}));
vi.mock("next/navigation",()=>({useRouter:()=>mocks.router}));
vi.mock("@/app/app/project-report-actions",()=>({generateProjectReport:mocks.generate,saveProjectReportSchedule:mocks.save}));
vi.mock("@/components/help-tip",()=>({HelpTip:({label}:{label:string})=><button type="button" aria-label={label}>?</button>}));

const props={organisationId:"org",projectId:"project",weekday:5,enabled:true,lastGeneratedAt:null,pdfColorTemplate:"forest"};
const scheduleForm=()=>screen.getByRole("form",{name:"Weekly report schedule"}) as HTMLFormElement;
const generationForm=()=>screen.getByRole("form",{name:"Generate current project report"}) as HTMLFormElement;
const palette=()=>screen.getByRole("combobox",{name:"PDF colour template"}) as HTMLSelectElement;
const scheduleButton=()=>screen.getByRole("button",{name:/Save report settings|Saving report settings/}) as HTMLButtonElement;
const generateButton=()=>screen.getByRole("button",{name:/Generate project report|Building report/}) as HTMLButtonElement;
function payload(form:HTMLFormElement,template:string){
  const data=new FormData(form);
  expect(data.getAll("organisationId")).toEqual(["org"]);
  expect(data.getAll("projectId")).toEqual(["project"]);
  expect(data.getAll("pdfColorTemplate")).toEqual([template]);
  return data;
}
function pendingResult(){
  let resolve:(value:ProjectReportActionState)=>void=()=>{};
  const promise=new Promise<ProjectReportActionState>(done=>{resolve=done;});
  return {promise,resolve};
}

beforeEach(()=>{
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({ok:true,message:"Weekly report generation is active."});
  mocks.generate.mockResolvedValue({ok:true,message:"Project report generated.",reportId:"new-report"});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe("visible project report controls and shared colour template",()=>{
  it("shows generation and schedule controls without opening a disclosure, with one palette selector",()=>{
    render(<ProjectReportControls {...props}/>);
    expect(scheduleForm().closest("details")).toBeNull();
    expect(generationForm().closest("details")).toBeNull();
    expect(scheduleButton().closest("details")).toBeNull();
    expect(generateButton().closest("details")).toBeNull();
    expect(screen.getAllByRole("combobox",{name:/colour template/i})).toHaveLength(1);
    expect(palette().value).toBe("forest");
    expect(generationForm().contains(palette())).toBe(true);
    expect(within(scheduleForm()).queryByRole("combobox",{name:/colour template/i})).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("includes exactly one saved palette and scoped identity in each independent form",()=>{
    render(<ProjectReportControls {...props}/>);
    const schedule=payload(scheduleForm(),"forest");
    const generation=payload(generationForm(),"forest");
    expect(schedule.getAll("weekday")).toEqual(["5"]);
    expect(schedule.getAll("enabled")).toEqual(["on"]);
    expect(Array.from(generation.keys()).sort()).toEqual(["organisationId","pdfColorTemplate","projectId"]);
    expect(within(scheduleForm()).getByRole("combobox",{name:"Generate every"})).toHaveProperty("value","5");
    expect(within(scheduleForm()).getByRole("checkbox",{name:"Automatic weekly generation"})).toHaveProperty("checked",true);
  });

  it("updates both payloads from the single palette choice without saving or generating on change",()=>{
    render(<ProjectReportControls {...props}/>);
    fireEvent.change(palette(),{target:{value:"burgundy"}});
    expect(palette().value).toBe("burgundy");
    payload(scheduleForm(),"burgundy");
    payload(generationForm(),"burgundy");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });

  it("keeps the existing weekday and opt-in checkbox field contract",()=>{
    render(<ProjectReportControls {...props} enabled={false}/>);
    const checkbox=screen.getByRole("checkbox",{name:"Automatic weekly generation"});
    expect(new FormData(scheduleForm()).getAll("enabled")).toEqual([]);
    fireEvent.change(screen.getByRole("combobox",{name:"Generate every"}),{target:{value:"1"}});
    fireEvent.click(checkbox);
    const enabled=payload(scheduleForm(),"forest");
    expect(enabled.getAll("weekday")).toEqual(["1"]);
    expect(enabled.getAll("enabled")).toEqual(["on"]);
    fireEvent.click(checkbox);
    expect(new FormData(scheduleForm()).getAll("enabled")).toEqual([]);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("submits the chosen palette through the unchanged schedule action without generating a report",async()=>{
    render(<ProjectReportControls {...props}/>);
    fireEvent.change(palette(),{target:{value:"slate"}});
    fireEvent.change(screen.getByRole("combobox",{name:"Generate every"}),{target:{value:"2"}});
    fireEvent.click(screen.getByRole("checkbox",{name:"Automatic weekly generation"}));
    fireEvent.submit(scheduleForm());
    await waitFor(()=>expect(mocks.save).toHaveBeenCalledOnce());
    const [state,form]=mocks.save.mock.calls[0] as [ProjectReportActionState,FormData];
    expect(state).toBeUndefined();
    expect(Array.from(form.entries()).sort()).toEqual([["organisationId","org"],["pdfColorTemplate","slate"],["projectId","project"],["weekday","2"]]);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("submits the shared palette and navigates only to the returned generated report",async()=>{
    render(<ProjectReportControls {...props}/>);
    fireEvent.change(palette(),{target:{value:"monochrome"}});
    fireEvent.submit(generationForm());
    await waitFor(()=>expect(mocks.generate).toHaveBeenCalledOnce());
    const [state,form]=mocks.generate.mock.calls[0] as [ProjectReportActionState,FormData];
    expect(state).toBeUndefined();
    expect(Array.from(form.entries()).sort()).toEqual([["organisationId","org"],["pdfColorTemplate","monochrome"],["projectId","project"]]);
    await waitFor(()=>expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith("/app/org/projects/project/reports/new-report"));
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each(["schedule","generation"] as const)("locks both actions and all editable report settings while %s is pending",async action=>{
    const pending=pendingResult();
    (action==="schedule"?mocks.save:mocks.generate).mockReturnValueOnce(pending.promise);
    render(<ProjectReportControls {...props}/>);
    fireEvent.submit(action==="schedule"?scheduleForm():generationForm());
    await waitFor(()=>{
      for(const control of [scheduleButton(),generateButton(),palette(),screen.getByRole("combobox",{name:"Generate every"}),screen.getByRole("checkbox",{name:"Automatic weekly generation"})])expect(control.matches(":disabled")).toBe(true);
    });
    expect(mocks.router.push).not.toHaveBeenCalled();
    await act(async()=>{pending.resolve({message:"Please retry the report request."});await pending.promise;});
    await waitFor(()=>{
      for(const control of [scheduleButton(),generateButton(),palette(),screen.getByRole("combobox",{name:"Generate every"}),screen.getByRole("checkbox",{name:"Automatic weekly generation"})])expect(control.matches(":disabled")).toBe(false);
    });
    expect(screen.getByRole("alert").textContent).toBe("Please retry the report request.");
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(action==="schedule"?mocks.generate:mocks.save).not.toHaveBeenCalled();
  });

  it("keeps the controls read-only inside an audited member preview without invoking either mutator",()=>{
    render(<AdminPreviewBoundary preview={{organisationId:"org",projectId:"project",role:"project_admin",displayName:"Project Manager",disciplines:[],expiresAt:"2099-01-01"}}><ProjectReportControls {...props}/></AdminPreviewBoundary>);
    for(const form of [scheduleForm(),generationForm()]){
      for(const control of form.querySelectorAll("button,input,select,textarea"))expect(control.matches(":disabled")).toBe(true);
      expect(fireEvent.submit(form)).toBe(false);
    }
    fireEvent.click(scheduleButton());
    fireEvent.click(generateButton());
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });
});
