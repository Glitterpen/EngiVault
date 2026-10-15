import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {ProjectCreateForm} from "./project-create-form";
import {createProject,type MutationState} from "@/app/app/actions";

const formState=vi.hoisted(()=>({state:undefined as MutationState,pending:false,action:vi.fn(),hook:vi.fn()}));
vi.mock("react",async(load)=>({
  ...await load<typeof import("react")>(),
  useActionState:(action:unknown,initial:unknown)=>{formState.hook(action,initial);return [formState.state,formState.action,formState.pending];},
}));
vi.mock("@/app/app/actions",()=>({createProject:vi.fn()}));

beforeEach(()=>{formState.state=undefined;formState.pending=false;formState.action.mockReset();formState.hook.mockReset();vi.mocked(createProject).mockReset();});
afterEach(()=>{expect(createProject).not.toHaveBeenCalled();expect(formState.action).not.toHaveBeenCalled();cleanup();vi.restoreAllMocks();});

it.each([undefined,false])("preserves the standalone card by default/explicit setting (%s)",embedded=>{
  render(<ProjectCreateForm organisationId="organisation-A" embedded={embedded}/>);
  const submit=screen.getByRole("button",{name:"Create project"});
  const form=submit.closest("form")!;
  expect(form.classList.contains("ev-card")).toBe(true);expect(form.classList.contains("p-6")).toBe(true);
  expect(screen.getByRole("heading",{name:"Create project"})).toBeTruthy();
  expect(formState.hook).toHaveBeenCalledExactlyOnceWith(createProject,undefined);
  const code=screen.getByRole("textbox",{name:"Project code"}) as HTMLInputElement;
  const name=screen.getByRole("textbox",{name:"Project name"}) as HTMLInputElement;
  expect(code.required).toBe(true);expect(name.required).toBe(true);expect(code.placeholder).toBe("ENG-001");
  fireEvent.change(code,{target:{value:"ENG-001"}});fireEvent.change(name,{target:{value:"Engineering project"}});
  expect(Object.fromEntries(new FormData(form))).toEqual({organisationId:"organisation-A",code:"ENG-001",name:"Engineering project"});
});

it("embeds without a duplicate card, heading or padding and keeps accessible input labels",()=>{
  render(<ProjectCreateForm organisationId="organisation-A" embedded/>);
  const form=screen.getByRole("button",{name:"Create project"}).closest("form")!;
  expect(form.classList.contains("ev-card")).toBe(false);expect(form.classList.contains("p-6")).toBe(false);
  expect(screen.queryByRole("heading")).toBeNull();
  expect(screen.getByLabelText("Project code").getAttribute("name")).toBe("code");
  expect(screen.getByLabelText("Project name").getAttribute("name")).toBe("name");
  expect(screen.queryByRole("tooltip")).toBeNull();
  const help=screen.getByRole("button",{name:"Project setup"});expect(help.getAttribute("type")).toBe("button");
  fireEvent.click(help);expect(screen.getByRole("tooltip").textContent).toContain("appoint its Project Manager and Document Controller");
});

it("assigns unique, stable input IDs to multiple forms",()=>{
  const result=render(<><ProjectCreateForm organisationId="A"/><ProjectCreateForm organisationId="B" embedded/></>);
  const before=screen.getAllByLabelText("Project code").map(input=>input.id);
  expect(new Set(before).size).toBe(2);expect(before.every(Boolean)).toBe(true);
  result.rerender(<><ProjectCreateForm organisationId="A"/><ProjectCreateForm organisationId="B" embedded/></>);
  expect(screen.getAllByLabelText("Project code").map(input=>input.id)).toEqual(before);
});

it("preserves pending creation feedback and disables only its mutation submit button",()=>{
  formState.pending=true;render(<ProjectCreateForm organisationId="organisation-A" embedded/>);
  expect((screen.getByRole("button",{name:"Creating project…"}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button",{name:"Project setup"}) as HTMLButtonElement).disabled).toBe(false);
});

it("keeps action errors visible as an alert without a fabricated success link",()=>{
  formState.state={message:"That project code already exists in this organisation."};
  render(<ProjectCreateForm organisationId="organisation-A" embedded/>);
  expect(screen.getByRole("alert").textContent).toBe(formState.state.message);
  expect(screen.queryByRole("status")).toBeNull();expect(screen.queryByRole("link",{name:"Appoint project leadership"})).toBeNull();
});

it("keeps successful feedback and leadership link bound to the current organisation",()=>{
  formState.state={message:"Project shell created. Appoint the Project Manager and Document Controller next.",projectId:"new-project"};
  const result=render(<ProjectCreateForm organisationId="organisation-A" embedded/>);
  expect(screen.getByRole("status").textContent).toContain(formState.state.message);
  expect(screen.getByRole("link",{name:"Appoint project leadership"}).getAttribute("href")).toBe("/app/organisation-A/projects/new-project/overview");
  result.rerender(<ProjectCreateForm organisationId="organisation-B" embedded/>);
  expect(screen.getByRole("link",{name:"Appoint project leadership"}).getAttribute("href")).toBe("/app/organisation-B/projects/new-project/overview");
  expect(screen.getByRole("button",{name:"Create project"}).closest("form")?.querySelector<HTMLInputElement>('input[name="organisationId"]')?.value).toBe("organisation-B");
});
