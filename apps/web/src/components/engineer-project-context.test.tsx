import {afterEach,describe,expect,it} from "vitest";
import {cleanup,render,screen,within} from "@testing-library/react";
import {EngineerProjectContext,EngineerProjectImpactSummary,type EngineerProjectContextProject,type EngineerProjectImpactSummaryProps} from "@/components/engineer-project-context";

const project:EngineerProjectContextProject={
  code:"FEED-001",
  name:"Electrical and instrumentation upgrade",
  project_introduction:"Replace obsolete control systems.\nRetain the existing operating interfaces.",
  key_objectives:["Complete the agreed FEED scope","Retain the approved safety interfaces"],
  planned_start_date:"2026-09-07",
  planned_end_date:"2026-10-09",
  delivery_stage:"feed",
};
const impact:EngineerProjectImpactSummaryProps={
  health:"lagging",projectActual:63.2,projectPlanned:70.1,engineerActual:55.4,engineerPlanned:65.2,
  engineerShare:31.5,contribution:17.5,expectedContribution:20.5,delayImpact:3.1,
};

afterEach(cleanup);

describe("engineer project brief",()=>{
  it("keeps the Manager's introduction, all objectives and dates visible outside disclosures",()=>{
    const {container}=render(<EngineerProjectContext project={project}/>);
    const brief=screen.getByRole("region",{name:"Project brief"});
    expect(brief.id).toBe("project-brief");
    expect(within(brief).getByRole("heading",{name:"Project introduction"})).toBeTruthy();
    const introduction=within(brief).getByText(/Replace obsolete control systems/);
    expect(introduction.textContent).toBe(project.project_introduction);
    expect(introduction.className).toContain("whitespace-pre-line");
    expect(within(brief).getAllByRole("listitem").map(item=>item.textContent)).toEqual(project.key_objectives);
    expect(within(brief).getByText("7 Sept 2026")).toBeTruthy();
    expect(within(brief).getByText("9 Oct 2026")).toBeTruthy();
    expect(within(brief).getByText("Issued for Design (IFD)")).toBeTruthy();
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector('[class*="line-clamp"]')).toBeNull();
    expect(container.querySelector("form,input,textarea,select")).toBeNull();
  });

  it("provides an ordinary keyboard-accessible jump link without introducing actions",()=>{
    render(<EngineerProjectContext project={project} deliverablesHref="#my-deliverables"/>);
    const link=screen.getByRole("link",{name:"My deliverables"});
    expect(link.getAttribute("href")).toBe("#my-deliverables");
    expect(link.className).toContain("min-h-11");
    link.focus();expect(document.activeElement).toBe(link);
  });

  it("does not invent a brief or dates when the Manager has not supplied them",()=>{
    render(<EngineerProjectContext project={{...project,project_introduction:null,key_objectives:[],planned_start_date:null,planned_end_date:null}}/>);
    expect(screen.getByText("The Project Manager has not added the project introduction yet.")).toBeTruthy();
    expect(screen.getByText("No key objectives have been recorded yet.")).toBeTruthy();
    expect(screen.getAllByText("Not set")).toHaveLength(2);
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("distinguishes unavailable project context from a Manager's empty content",()=>{
    render(<EngineerProjectContext project={null}/>);
    expect(screen.getByText("The project brief is currently unavailable.")).toBeTruthy();
    expect(screen.queryByText(/has not added/)).toBeNull();
  });

  it("tolerates a legacy project row without an objectives array",()=>{
    const {key_objectives:objectives,...legacyProject}=project;
    expect(objectives.length).toBe(2);
    render(<EngineerProjectContext project={legacyProject as EngineerProjectContextProject}/>);
    expect(screen.getByText("No key objectives have been recorded yet.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("keeps long Manager-authored text and objectives in full with wrapping, not truncation",()=>{
    const longText="Detailed engineering scope and interface coordination. ".repeat(30);
    const longObjective="VerifyVeryLongUnbrokenEngineeringInterfaceIdentifier".repeat(10);
    const {container}=render(<EngineerProjectContext project={{...project,project_introduction:longText,key_objectives:[longObjective]}}/>);
    expect(container.textContent).toContain(longText);
    expect(screen.getByRole("listitem").textContent).toBe(longObjective);
    expect(screen.getByRole("listitem").className).toContain("break-words");
    expect(container.querySelector('[class*="truncate"],[class*="line-clamp"]')).toBeNull();
  });
});

describe("visible engineer project impact",()=>{
  it("shows the supplied accepted progress and baseline figures without changing their basis",()=>{
    const {container}=render(<EngineerProjectImpactSummary {...impact}/>);
    const section=screen.getByRole("region",{name:"My project impact"});
    expect(section.id).toBe("project-impact");
    expect(screen.getByText("63.2%")).toBeTruthy();
    expect(screen.getByText("55.4%")).toBeTruthy();
    expect(screen.getByText("MDR expected: 70.1%")).toBeTruthy();
    expect(screen.getByText("MDR expected: 65.2%")).toBeTruthy();
    expect(screen.getByText(/Expected: 20.5 percentage points/)).toBeTruthy();
    expect(screen.getByText("Your scope: 31.5% of project weight")).toBeTruthy();
    expect(screen.getByText("Contribution to project progress").parentElement?.textContent).toContain("17.5 percentage points");
    expect(screen.getByText("Gap to expected contribution").parentElement?.textContent).toContain("3.1 percentage points");
    expect(screen.getByText("A progress gap, not a measured schedule delay in days.")).toBeTruthy();
    expect(container.querySelector("details,form,input,textarea,select")).toBeNull();
    expect(container.textContent).not.toContain("holding back");
  });

  it("uses labelled native progress elements and safe display-only bounds",()=>{
    render(<EngineerProjectImpactSummary {...impact} projectActual={105} engineerActual={-1}/>);
    const projectProgress=screen.getByRole("progressbar",{name:"Overall project DCC-accepted progress"});
    const myProgress=screen.getByRole("progressbar",{name:"My disciplines DCC-accepted progress"});
    expect(projectProgress.tagName).toBe("PROGRESS");
    expect(projectProgress.className).toContain("[&::-webkit-progress-value]:bg-[#10243e]");
    expect(projectProgress.className).toContain("[&::-moz-progress-bar]:bg-[#10243e]");
    expect(projectProgress.getAttribute("value")).toBe("100");
    expect(myProgress.getAttribute("value")).toBe("0");
    expect(screen.getByText("105%")).toBeTruthy();
    expect(screen.getByText("-1%")).toBeTruthy();
  });

  it("explains an unassigned scope honestly without inventing activity or personal obligations",()=>{
    render(<EngineerProjectImpactSummary {...impact} health="no_scope" engineerActual={0} contribution={0} delayImpact={0}/>);
    expect(screen.getByText("Awaiting assignments")).toBeTruthy();
    expect(screen.getByText("No MDR deliverables are assigned to you yet.")).toBeTruthy();
    expect(screen.queryByText(/creating a negative project schedule/)).toBeNull();
  });
});
