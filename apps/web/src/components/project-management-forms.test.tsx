import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {EditableProjectBrief,ProjectIssueForm} from "./project-management-forms";
import {updateProjectBrief} from "@/app/app/workflow-actions";

vi.mock("@/app/app/workflow-actions",()=>({
  createProjectIssue:vi.fn(),
  updateProjectBrief:vi.fn(),
  upsertResourcePlan:vi.fn(),
}));
vi.mock("@/components/help-tip",()=>({HelpTip:()=>null}));

beforeEach(()=>{vi.mocked(updateProjectBrief).mockReset();});
afterEach(cleanup);

it.each([
  ["by default",undefined,true],
  ["when embedding is explicitly disabled",false,true],
  ["when embedded inside an existing panel",true,false],
])("preserves issue fields and the appropriate card wrapper %s",(_description,embedded,hasCard)=>{
  render(<ProjectIssueForm organisationId="organisation" projectId="project" embedded={embedded}/>);
  const submit=screen.getByRole("button",{name:"Report issue"});
  const form=submit.closest("form");
  expect(form?.classList.contains("ev-card")).toBe(hasCard);
  expect(screen.getByRole("heading",{name:"Report project issue"})).toBeTruthy();
  expect((screen.getByRole("textbox",{name:"Issue title"}) as HTMLInputElement).required).toBe(true);
  expect(screen.getByRole("textbox",{name:"Description"}).tagName).toBe("TEXTAREA");
  expect((screen.getByRole("combobox",{name:"Severity"}) as HTMLSelectElement).value).toBe("medium");
  expect((screen.getByLabelText("Target resolution") as HTMLInputElement).type).toBe("date");
  expect(screen.getByRole("textbox",{name:"Issue owner"})).toBeTruthy();
  expect((submit as HTMLButtonElement).disabled).toBe(false);
  expect(form?.querySelector<HTMLInputElement>('input[name="organisationId"]')?.value).toBe("organisation");
  expect(form?.querySelector<HTMLInputElement>('input[name="projectId"]')?.value).toBe("project");
});

const brief={organisationId:"organisation-A",projectId:"project-A",introduction:"Upgrade the terminal export systems and issue controlled engineering deliverables.",objectives:["Issue approved design deliverables","Close identified project risks"],startDate:"2026-10-01",endDate:"2026-12-31",deliveryStage:"feed" as const,dccCount:1};

describe("editable project brief presentation",()=>{
  it.each([undefined,false])("preserves the standalone card when embedded is %s",embedded=>{
    render(<EditableProjectBrief {...brief} embedded={embedded}/>);
    const article=screen.getByRole("article");
    expect(article.classList.contains("ev-card")).toBe(true);
    expect(article.classList.contains("p-5")).toBe(true);
    expect(article.classList.contains("sm:p-6")).toBe(true);
    expect(within(article).getByRole("heading",{name:"Introduction and key objectives"})).toBeTruthy();
    expect(within(article).getByText(brief.introduction)).toBeTruthy();
  });
  it("embeds without a nested card while keeping all project information and the editor",()=>{
    render(<EditableProjectBrief {...brief} embedded/>);
    const article=screen.getByRole("article");
    expect(article.className).toBe("min-w-0");
    expect(within(article).getByText(brief.introduction)).toBeTruthy();
    for(const objective of brief.objectives)expect(within(article).getByText(objective)).toBeTruthy();
    expect(within(article).getByText("FEED")).toBeTruthy();
    expect(within(article).getByText("Issued for Design (IFD)")).toBeTruthy();
    expect(within(article).getByText("1 active")).toBeTruthy();
    fireEvent.click(within(article).getByRole("button",{name:"Edit project brief"}));
    expect(article.querySelector(".ev-card")).toBeNull();
    expect(within(article).getByRole("button",{name:"Save project brief"})).toBeTruthy();
  });
  it.each([[null,"Unavailable"],[0,"Not appointed"],[2,"2 active"]])("distinguishes DCC count %s from its presentation %s",(dccCount,value)=>{
    render(<EditableProjectBrief {...brief} dccCount={dccCount} embedded/>);
    const datum=screen.getByText("DCC appointed").parentElement!;
    expect(within(datum).getByText(value!)).toBeTruthy();
    if(dccCount===null){
      expect(within(datum).queryByText("Not appointed")).toBeNull();
      expect(within(datum).queryByText(/active/)).toBeNull();
    }
  });
  it("does not expose edit fields or mutation controls when the brief is read-only",()=>{
    render(<EditableProjectBrief {...brief} dccCount={null} editable={false} embedded/>);
    const article=screen.getByRole("article");
    expect(within(article).getByText(brief.introduction)).toBeTruthy();
    expect(within(article).getByText("Unavailable")).toBeTruthy();
    expect(within(article).queryByRole("button",{name:"Edit project brief"})).toBeNull();
    expect(within(article).queryByRole("button",{name:"Save project brief"})).toBeNull();
    expect(within(article).queryByRole("textbox")).toBeNull();
    expect(article.querySelector("form")).toBeNull();
    expect(updateProjectBrief).not.toHaveBeenCalled();
  });
});

describe("project brief editor regression",()=>{
  it("toggles without saving and retains the existing scope, stage, objectives and date fields",()=>{
    render(<EditableProjectBrief {...brief} embedded/>);
    const edit=screen.getByRole("button",{name:"Edit project brief"});
    expect(edit.getAttribute("type")).toBe("button");
    expect(edit.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(edit);
    const close=screen.getByRole("button",{name:"Close editor"});
    expect(close.getAttribute("type")).toBe("button");
    expect(close.getAttribute("aria-expanded")).toBe("true");
    const save=screen.getByRole("button",{name:"Save project brief"}) as HTMLButtonElement;
    expect(save.type).toBe("submit");
    expect(save.disabled).toBe(false);
    expect(Object.fromEntries(new FormData(save.closest("form")!))).toEqual({organisationId:brief.organisationId,projectId:brief.projectId,deliveryStage:"feed",introduction:brief.introduction,keyObjectives:brief.objectives.join("\n"),startDate:brief.startDate,endDate:brief.endDate});
    expect((screen.getByRole("combobox",{name:"Engineering delivery stage"}) as HTMLSelectElement).required).toBe(true);
    const introduction=screen.getByRole("textbox",{name:"Project introduction"}) as HTMLTextAreaElement;
    expect(introduction.required).toBe(true);expect(introduction.minLength).toBe(20);expect(introduction.maxLength).toBe(4000);
    expect((screen.getByRole("textbox",{name:"Key objectives"}) as HTMLTextAreaElement).maxLength).toBe(6500);
    expect((screen.getByLabelText("Planned start") as HTMLInputElement).type).toBe("date");
    expect((screen.getByLabelText("Planned completion") as HTMLInputElement).type).toBe("date");
    fireEvent.click(close);
    expect(screen.queryByRole("button",{name:"Save project brief"})).toBeNull();
    expect(screen.getByText(brief.introduction)).toBeTruthy();
    expect(screen.getByRole("button",{name:"Edit project brief"}).getAttribute("aria-expanded")).toBe("false");
    expect(updateProjectBrief).not.toHaveBeenCalled();
  });
  it.each([false,true])("keeps the existing save action and announces feedback (success: %s)",async ok=>{
    const message=ok?"Project delivery stage, introduction, objectives and timeline saved.":"Project brief could not be saved.";
    vi.mocked(updateProjectBrief).mockResolvedValue({ok,message});
    render(<EditableProjectBrief {...brief} embedded/>);
    fireEvent.click(screen.getByRole("button",{name:"Edit project brief"}));
    const form=screen.getByRole("button",{name:"Save project brief"}).closest("form")!;
    await act(async()=>{fireEvent.submit(form);});
    expect(updateProjectBrief).toHaveBeenCalledTimes(1);
    const [previous,data]=vi.mocked(updateProjectBrief).mock.calls[0];
    expect(previous).toBeUndefined();
    expect(Object.fromEntries(data)).toEqual({organisationId:brief.organisationId,projectId:brief.projectId,deliveryStage:"feed",introduction:brief.introduction,keyObjectives:brief.objectives.join("\n"),startDate:brief.startDate,endDate:brief.endDate});
    expect(screen.getByRole(ok?"status":"alert").textContent).toBe(message);
    expect(screen.queryByRole(ok?"alert":"status")).toBeNull();
    expect(screen.getByRole("button",{name:"Close editor"})).toBeTruthy();
    expect((screen.getByRole("button",{name:"Save project brief"}) as HTMLButtonElement).disabled).toBe(false);
  });
});
