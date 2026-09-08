import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import {RevisionCycleForm} from "./revision-cycle-form";
vi.mock("@/app/app/revision-cycle-actions",()=>({updateRevisionCycle:vi.fn()}));
afterEach(cleanup);
describe("revision cycle setting",()=>{
  it("lets the PM enter whole working days with a clear recalculation warning",()=>{
    render(<RevisionCycleForm organisationId="org" projectId="project" days={3}/>);
    const input=screen.getByRole("spinbutton",{name:"Revision cycle (working days)"}) as HTMLInputElement;
    expect(input.value).toBe("3");expect(input.min).toBe("1");expect(input.step).toBe("1");
    expect(screen.getByText(/older issues may become overdue immediately/)).toBeTruthy();
  });
  it("shows the cycle but no mutation controls in read-only preview",()=>{
    render(<RevisionCycleForm organisationId="org" projectId="project" days={3} readOnly/>);
    expect(screen.getByText("3 working days")).toBeTruthy();expect(screen.queryByRole("button")).toBeNull();expect(screen.queryByRole("spinbutton")).toBeNull();
  });
});
