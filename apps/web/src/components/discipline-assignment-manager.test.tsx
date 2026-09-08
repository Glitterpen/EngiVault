import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {DisciplineAssignmentManager} from "./discipline-assignment-manager";
import type {DisciplineAssignmentScope} from "@/lib/discipline-assignment-scopes";
vi.mock("@/app/app/workflow-actions",()=>({assignDisciplineDocuments:vi.fn()}));
afterEach(cleanup);
const engineer={userId:"engineer",name:"Engineer",email:"engineer@example.test",disciplines:["Electrical","Instrumentation"]};
const scope=(name:string,remainingCount:number):DisciplineAssignmentScope=>({name,documentCount:3,engineers:[{...engineer,remainingCount,assignedCount:3-remainingCount}]});
const panel=(disciplines:DisciplineAssignmentScope[])=> <DisciplineAssignmentManager organisationId="org" projectId="project" disciplines={disciplines}/>;

it("hides fully assigned disciplines but keeps another discipline for the same work email",()=>{
  render(panel([scope("Electrical",0),scope("Instrumentation",2)]));
  const options=within(screen.getByRole("combobox",{name:"MDR discipline"}));
  expect(options.queryByRole("option",{name:/Electrical/})).toBeNull();
  expect(options.getByRole("option",{name:/Instrumentation/})).toBeTruthy();
  expect(screen.getByRole("button",{name:"Assign remaining 2"})).toBeTruthy();
  expect(screen.getByText("View assigned allocations (2)")).toBeTruthy();
});
it("only removes the completed engineer, not other eligible engineers in that discipline",()=>{
  const electrical=scope("Electrical",0);
  electrical.engineers.push({...engineer,userId:"second",name:"Second engineer",assignedCount:0,remainingCount:3});
  render(panel([electrical]));
  const select=screen.getByRole("combobox",{name:"PM-appointed engineer"}) as HTMLSelectElement;
  expect(select.options).toHaveLength(1);
  expect(select.value).toBe("second");
});
it("moves to the next valid discipline when a refreshed assignment disappears",()=>{
  const {rerender}=render(panel([scope("Electrical",1),scope("Instrumentation",3)]));
  fireEvent.change(screen.getByRole("combobox",{name:"MDR discipline"}),{target:{value:"Electrical"}});
  rerender(panel([scope("Electrical",0),scope("Instrumentation",3)]));
  expect((screen.getByRole("combobox",{name:"MDR discipline"}) as HTMLSelectElement).value).toBe("Instrumentation");
  expect(screen.getByRole("button",{name:"Assign remaining 3"})).toBeTruthy();
});
it("shows completion instead of an empty assignment form, and reopens for new work",()=>{
  const {rerender}=render(panel([scope("Electrical",0)]));
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByRole("button",{name:/Assign/})).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("All current deliverables are assigned");
  rerender(panel([scope("Electrical",1)]));
  expect(screen.getByRole("button",{name:"Assign remaining 1"})).toBeTruthy();
});
it("keeps unstaffed disciplines visible and disables assignment",()=>{
  render(panel([{name:"Process",documentCount:3,engineers:[]}]));
  expect(screen.getByText(/Ask the Project Manager to appoint/)).toBeTruthy();
  expect((screen.getByRole("button",{name:"Assign remaining 0"}) as HTMLButtonElement).disabled).toBe(true);
});
