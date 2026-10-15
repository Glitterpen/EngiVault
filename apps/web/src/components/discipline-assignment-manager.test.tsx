import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {DisciplineAssignmentManager} from "./discipline-assignment-manager";
import type {DisciplineAssignmentScope} from "@/lib/discipline-assignment-scopes";
vi.mock("@/app/app/workflow-actions",()=>({assignDisciplineDocuments:vi.fn()}));
afterEach(cleanup);
const engineer={userId:"engineer",name:"Engineer",email:"engineer@example.test",disciplines:["Electrical","Instrumentation"]};
const scope=(name:string,remainingCount:number):DisciplineAssignmentScope=>({name,documentCount:3,engineers:[{...engineer,remainingCount,assignedCount:3-remainingCount}]});
const panel=(disciplines:DisciplineAssignmentScope[])=> <DisciplineAssignmentManager organisationId="org" projectId="project" disciplines={disciplines}/>;
function openPanel(){fireEvent.click(screen.getByText("Assign deliverables by discipline").closest("summary")!);}

it("hides fully assigned disciplines but keeps another discipline for the same work email",()=>{
  render(panel([scope("Electrical",0),scope("Instrumentation",2)]));
  openPanel();
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
  openPanel();
  const select=screen.getByRole("combobox",{name:"PM-appointed engineer"}) as HTMLSelectElement;
  expect(select.options).toHaveLength(1);
  expect(select.value).toBe("second");
});
it("moves to the next valid discipline when a refreshed assignment disappears",()=>{
  const {rerender}=render(panel([scope("Electrical",1),scope("Instrumentation",3)]));
  openPanel();
  fireEvent.change(screen.getByRole("combobox",{name:"MDR discipline"}),{target:{value:"Electrical"}});
  rerender(panel([scope("Electrical",0),scope("Instrumentation",3)]));
  expect((screen.getByRole("combobox",{name:"MDR discipline"}) as HTMLSelectElement).value).toBe("Instrumentation");
  expect(screen.getByRole("button",{name:"Assign remaining 3"})).toBeTruthy();
});
it("shows completion instead of an empty assignment form, and reopens for new work",()=>{
  const {rerender}=render(panel([scope("Electrical",0)]));
  openPanel();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByRole("button",{name:/Assign/})).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("All current deliverables are assigned");
  rerender(panel([scope("Electrical",1)]));
  expect(screen.getByRole("button",{name:"Assign remaining 1"})).toBeTruthy();
});
it("keeps unstaffed disciplines visible and disables assignment",()=>{
  render(panel([{name:"Process",documentCount:3,engineers:[]}]));
  openPanel();
  expect(screen.getByText(/Ask the Project Manager to appoint/)).toBeTruthy();
  expect((screen.getByRole("button",{name:"Assign remaining 0"}) as HTMLButtonElement).disabled).toBe(true);
});

it("starts collapsed while keeping outstanding discipline counts in the summary",()=>{
  render(panel([scope("Electrical",0),scope("Instrumentation",2)]));
  const heading=screen.getByText("Assign deliverables by discipline");
  const disclosure=heading.closest("details")!;
  expect(disclosure.open).toBe(false);
  expect(within(disclosure.querySelector("summary")!).getByText(/^1 discipline.* outstanding$/)).toBeTruthy();
  openPanel();
  expect(disclosure.open).toBe(true);
});

it("preserves allocation information but removes every mutation control in read-only preview",()=>{
  const {container}=render(<DisciplineAssignmentManager organisationId="org" projectId="project" disciplines={[scope("Electrical",2)]} readOnly/>);
  openPanel();
  expect(screen.getByText("Read-only preview. Assignment changes are unavailable.")).toBeTruthy();
  expect(screen.getByText(/Engineer: 2 remaining/)).toBeTruthy();
  expect(screen.getByText("View assigned allocations (1)")).toBeTruthy();
  expect(screen.queryByRole("combobox",{hidden:true})).toBeNull();
  expect(screen.queryByRole("button",{name:/Assign remaining/,hidden:true})).toBeNull();
  expect(container.querySelector("form")).toBeNull();
});

it("shows embedded assignment controls immediately without a second outer disclosure",()=>{
  const {container}=render(<DisciplineAssignmentManager organisationId="org" projectId="project" disciplines={[scope("Electrical",2)]} embedded/>);
  const heading=screen.getByRole("heading",{name:"Assign deliverables by discipline"});
  expect(heading.closest("section")).toBeTruthy();
  expect(heading.closest("details")).toBeNull();
  expect(screen.getByRole("combobox",{name:"MDR discipline"})).toBeTruthy();
  expect(screen.getByRole("button",{name:"Assign remaining 2"})).toBeTruthy();
  const form=container.querySelector("form")!;
  expect((form.querySelector('[name="organisationId"]') as HTMLInputElement).value).toBe("org");
  expect((form.querySelector('[name="projectId"]') as HTMLInputElement).value).toBe("project");
});

it("keeps embedded audited previews read-only while exposing allocation history",()=>{
  const {container}=render(<DisciplineAssignmentManager organisationId="org" projectId="project" disciplines={[scope("Electrical",2)]} embedded readOnly/>);
  expect(screen.getByRole("heading",{name:"Assign deliverables by discipline"}).closest("details")).toBeNull();
  expect(screen.getByText("Read-only preview. Assignment changes are unavailable.")).toBeTruthy();
  expect(screen.getByText(/Engineer: 2 remaining/)).toBeTruthy();
  expect(screen.getByText("View assigned allocations (1)")).toBeTruthy();
  expect(screen.queryByRole("combobox",{hidden:true})).toBeNull();
  expect(screen.queryByRole("button",{name:/Assign remaining/,hidden:true})).toBeNull();
  expect(container.querySelector("form")).toBeNull();
});
