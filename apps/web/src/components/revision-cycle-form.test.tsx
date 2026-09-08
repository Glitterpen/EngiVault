import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {RevisionCycleForm} from "./revision-cycle-form";
vi.mock("@/app/app/revision-cycle-actions",()=>({updateRevisionCycle:vi.fn()}));
afterEach(cleanup);
describe("revision cycle setting",()=>{
  it("keeps the form compact and shows the explanation only when hovering over help",()=>{
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
