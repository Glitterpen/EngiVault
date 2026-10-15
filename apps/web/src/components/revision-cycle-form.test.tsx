import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {RevisionCycleForm} from "./revision-cycle-form";
import {updateRevisionCycle,type RevisionCycleState} from "@/app/app/revision-cycle-actions";

const formState=vi.hoisted(()=>({state:{} as RevisionCycleState,pending:false,action:vi.fn(),hook:vi.fn()}));
vi.mock("react",async(load)=>({
  ...await load<typeof import("react")>(),
  useActionState:(action:unknown,initial:unknown)=>{formState.hook(action,initial);return [formState.state,formState.action,formState.pending];},
}));
vi.mock("@/app/app/revision-cycle-actions",()=>({updateRevisionCycle:vi.fn()}));
beforeEach(()=>{formState.state={};formState.pending=false;formState.action.mockReset();formState.hook.mockReset();vi.mocked(updateRevisionCycle).mockReset();});
afterEach(()=>{expect(formState.action).not.toHaveBeenCalled();expect(updateRevisionCycle).not.toHaveBeenCalled();cleanup();vi.useRealTimers();});
describe("embedded revision cycle setting",()=>{
  it.each([undefined,false])("preserves its standalone card and heading by default/explicit setting (%s)",embedded=>{
    render(<RevisionCycleForm organisationId="org" projectId="project" days={3} embedded={embedded}/>);
    const section=screen.getByRole("region",{name:"MDR revision cycle"});
    expect(section.classList.contains("ev-card")).toBe(true);expect(section.classList.contains("p-5")).toBe(true);expect(section.classList.contains("sm:p-6")).toBe(true);
    expect(within(section).getByRole("heading",{name:"MDR revision cycle"})).toBeTruthy();
  });
  it("embeds without a nested card, background or padding while keeping the heading and optional help",()=>{
    render(<RevisionCycleForm organisationId="org" projectId="project" days={3} embedded/>);
    const section=screen.getByRole("region",{name:"MDR revision cycle"});
    expect(section.className).toBe("min-w-0");
    expect(within(section).getByRole("heading",{name:"MDR revision cycle"})).toBeTruthy();
    const help=within(section).getByRole("button",{name:"About the MDR revision cycle"});
    expect(help.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(help);
    expect(screen.getByRole("tooltip").textContent).toContain("Monday–Friday only; public holidays are counted");
    expect(screen.getByRole("tooltip").textContent).toContain("The first-issue plan stays unchanged");
  });
  it("preserves the action, tenant/project fields and required whole-working-day bounds",()=>{
    render(<RevisionCycleForm organisationId="organisation-A" projectId="project-A" days={5} embedded/>);
    const input=screen.getByLabelText("Revision cycle (working days)") as HTMLInputElement;
    expect(input.type).toBe("number");expect(input.name).toBe("workingDays");expect(input.value).toBe("5");
    expect(input.min).toBe("1");expect(input.max).toBe("365");expect(input.step).toBe("1");expect(input.required).toBe(true);
    const submit=screen.getByRole("button",{name:"Save revision cycle"}) as HTMLButtonElement;
    expect(submit.type).toBe("submit");expect(submit.disabled).toBe(false);
    expect(Object.fromEntries(new FormData(submit.closest("form")!))).toEqual({organisationId:"organisation-A",projectId:"project-A",workingDays:"5"});
    expect(formState.hook).toHaveBeenCalledExactlyOnceWith(updateRevisionCycle,{});
  });
  it("keeps an unset cycle empty rather than fabricating a working-day default",()=>{
    render(<RevisionCycleForm organisationId="org" projectId="project" days={null} embedded/>);
    const input=screen.getByRole("spinbutton",{name:"Revision cycle (working days)"}) as HTMLInputElement;
    expect(input.value).toBe("");expect(input.placeholder).toBe("e.g. 3");
  });
  it.each([3,null])("keeps read-only state without any save form or fields (days: %s)",days=>{
    render(<RevisionCycleForm organisationId="org" projectId="project" days={days} readOnly embedded/>);
    expect(screen.getByText(days?`${days} working days`:"Not yet set by the Project Manager")).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Save revision cycle"})).toBeNull();expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByRole("region",{name:"MDR revision cycle"}).querySelector("form")).toBeNull();
    expect(screen.getByRole("button",{name:"About the MDR revision cycle"})).toBeTruthy();
  });
  it("preserves pending feedback without disabling help",()=>{
    formState.pending=true;
    render(<RevisionCycleForm organisationId="org" projectId="project" days={3} embedded/>);
    expect((screen.getByRole("button",{name:"Saving…"}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button",{name:"About the MDR revision cycle"}) as HTMLButtonElement).disabled).toBe(false);
  });
  it.each([false,true])("announces action feedback as alert or status (success: %s)",ok=>{
    formState.state={ok,message:ok?"Revision cycle saved: 3 working days.":"Revision cycle could not be saved."};
    render(<RevisionCycleForm organisationId="org" projectId="project" days={3} embedded/>);
    expect(screen.getByRole(ok?"status":"alert").textContent).toBe(formState.state.message);
    expect(screen.queryByRole(ok?"alert":"status")).toBeNull();
  });
  it("keeps explicit input IDs unique and stable when more than one cycle form is rendered",()=>{
    const result=render(<><RevisionCycleForm organisationId="org" projectId="A" days={3}/><RevisionCycleForm organisationId="org" projectId="B" days={5} embedded/></>);
    const ids=screen.getAllByLabelText("Revision cycle (working days)").map(input=>input.id);
    expect(ids.every(Boolean)).toBe(true);expect(new Set(ids).size).toBe(2);
    result.rerender(<><RevisionCycleForm organisationId="org" projectId="A" days={3}/><RevisionCycleForm organisationId="org" projectId="B" days={5} embedded/></>);
    expect(screen.getAllByLabelText("Revision cycle (working days)").map(input=>input.id)).toEqual(ids);
  });
});

describe("revision cycle setting",()=>{
  it("keeps the form compact and shows the explanation only when hovering over help",()=>{
    vi.useFakeTimers();
    render(<RevisionCycleForm organisationId="org" projectId="project" days={3}/>);
    const input=screen.getByRole("spinbutton",{name:"Revision cycle (working days)"}) as HTMLInputElement;
    expect(input.value).toBe("3");expect(input.min).toBe("1");expect(input.step).toBe("1");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.queryByText(/older issues may become overdue immediately/)).toBeNull();
    const help=screen.getByRole("button",{name:"About the MDR revision cycle"});
    fireEvent.mouseEnter(help);
    const tooltip=screen.getByRole("tooltip");
    expect(help.getAttribute("aria-describedby")).toBe(tooltip.id);
    expect(within(tooltip).getByText(/Monday–Friday only/)).toBeTruthy();
    expect(within(tooltip).getByText(/due Wednesday and overdue Thursday/)).toBeTruthy();
    expect(within(tooltip).getByText(/older issues may become overdue immediately/)).toBeTruthy();
    fireEvent.mouseLeave(help,{relatedTarget:tooltip});
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.mouseLeave(tooltip);
    act(()=>vi.advanceTimersByTime(150));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("supports keyboard focus, Escape and tapping the help icon",()=>{
    render(<RevisionCycleForm organisationId="org" projectId="project" days={3}/>);
    const help=screen.getByRole("button",{name:"About the MDR revision cycle"});
    expect(help.getAttribute("type")).toBe("button");
    fireEvent.focus(help);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(help,{key:"Escape"});
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(help);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.blur(help);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("shows the cycle but no mutation controls in read-only preview",()=>{
    render(<RevisionCycleForm organisationId="org" projectId="project" days={3} readOnly/>);
    expect(screen.getByText("3 working days")).toBeTruthy();expect(screen.queryByRole("button",{name:"Save revision cycle"})).toBeNull();expect(screen.queryByRole("spinbutton")).toBeNull();
    fireEvent.mouseEnter(screen.getByRole("button",{name:"About the MDR revision cycle"}));
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });
});
