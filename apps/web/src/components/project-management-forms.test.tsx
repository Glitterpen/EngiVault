import {afterEach,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import {ProjectIssueForm} from "./project-management-forms";

vi.mock("@/app/app/workflow-actions",()=>({
  createProjectIssue:vi.fn(),
  updateProjectBrief:vi.fn(),
  upsertResourcePlan:vi.fn(),
}));
vi.mock("@/components/help-tip",()=>({HelpTip:()=>null}));

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
