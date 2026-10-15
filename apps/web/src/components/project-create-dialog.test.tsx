import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {ProjectCreateDialog} from "./project-create-dialog";
import {createProject,type MutationState} from "@/app/app/actions";

const formState=vi.hoisted(()=>({state:undefined as MutationState,pending:false,action:vi.fn()}));
vi.mock("react",async(load)=>({
  ...await load<typeof import("react")>(),
  useActionState:()=>[formState.state,formState.action,formState.pending],
}));
vi.mock("@/app/app/actions",()=>({createProject:vi.fn()}));

beforeEach(()=>{
  formState.state=undefined;formState.pending=false;formState.action.mockReset();vi.mocked(createProject).mockReset();
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
  Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(this:HTMLDialogElement){this.open=false;this.dispatchEvent(new Event("close"));}});
});
afterEach(()=>{expect(createProject).not.toHaveBeenCalled();expect(formState.action).not.toHaveBeenCalled();cleanup();vi.restoreAllMocks();});

it("shows one primary New project button and keeps creation fields out of the default dashboard",()=>{
  render(<ProjectCreateDialog organisationId="organisation-A"/>);
  const trigger=screen.getByRole("button",{name:"New project"});
  expect(trigger.classList.contains("ev-button")).toBe(true);expect(trigger.getAttribute("type")).toBe("button");
  expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(trigger.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  expect(screen.queryByRole("dialog",{name:"Create project"})).toBeNull();
  expect(screen.queryByLabelText("Project code")).toBeNull();expect(screen.queryByLabelText("Project name")).toBeNull();
});

it("opens one labelled modal and embeds the existing scoped creation form",()=>{
  render(<ProjectCreateDialog organisationId="organisation-A"/>);
  const trigger=screen.getByRole("button",{name:"New project"});fireEvent.click(trigger);
  const dialog=screen.getByRole("dialog",{name:"Create project"});
  expect(dialog.tagName).toBe("DIALOG");expect(dialog.id).toBe(trigger.getAttribute("aria-controls"));
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(within(dialog).getAllByRole("heading",{name:"Create project"})).toHaveLength(1);
  expect(within(dialog).getByRole("textbox",{name:"Project code"})).toBeTruthy();
  expect(within(dialog).getByRole("textbox",{name:"Project name"})).toBeTruthy();
  const form=within(dialog).getByRole("button",{name:"Create project"}).closest("form")!;
  expect(form.classList.contains("ev-card")).toBe(false);expect(form.classList.contains("p-6")).toBe(false);
  expect(form.querySelector<HTMLInputElement>('input[name="organisationId"]')?.value).toBe("organisation-A");
  expect(document.body.style.overflow).toBe("hidden");
});

it("preserves an unfinished draft, restores focus and unlocks scrolling after native keyboard dismissal",()=>{
  render(<ProjectCreateDialog organisationId="organisation-A"/>);
  const trigger=screen.getByRole("button",{name:"New project"});fireEvent.click(trigger);
  fireEvent.change(screen.getByLabelText("Project code"),{target:{value:"ENG-NEW"}});
  fireEvent.change(screen.getByLabelText("Project name"),{target:{value:"Unfinished project"}});
  const dialog=screen.getByRole("dialog",{name:"Create project"}) as HTMLDialogElement;
  // Native Escape handling closes the top-layer dialog then fires close. JSDOM
  // has no top layer, so exercise the resulting native close lifecycle directly.
  act(()=>dialog.close());
  expect(screen.queryByRole("dialog",{name:"Create project"})).toBeNull();
  expect(document.activeElement).toBe(trigger);expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.body.style.overflow).not.toBe("hidden");
  fireEvent.click(trigger);
  expect((screen.getByLabelText("Project code") as HTMLInputElement).value).toBe("ENG-NEW");
  expect((screen.getByLabelText("Project name") as HTMLInputElement).value).toBe("Unfinished project");
});

it("closes from its named close button without submitting or opting mutations out of preview restrictions",()=>{
  render(<ProjectCreateDialog organisationId="organisation-A"/>);
  const trigger=screen.getByRole("button",{name:"New project"});
  expect(trigger.hasAttribute("data-preview-safe")).toBe(false);fireEvent.click(trigger);
  const dialog=screen.getByRole("dialog",{name:"Create project"});
  const close=within(dialog).getByRole("button",{name:"Close create project"});
  const submit=within(dialog).getByRole("button",{name:"Create project"});
  expect(close.getAttribute("type")).toBe("button");expect(close.hasAttribute("data-preview-safe")).toBe(false);
  expect(submit.closest("[data-preview-safe]")).toBeNull();expect(dialog.closest("[data-preview-safe]")).toBeNull();
  fireEvent.click(close);expect(document.activeElement).toBe(trigger);expect(screen.queryByRole("dialog",{name:"Create project"})).toBeNull();
});

it.each([false,true])("keeps live action feedback inside the dialog (success: %s)",success=>{
  formState.state={message:success?"Project created.":"Project could not be created.",...(success?{projectId:"created-project"}:{})};
  render(<ProjectCreateDialog organisationId="organisation-A"/>);fireEvent.click(screen.getByRole("button",{name:"New project"}));
  const dialog=screen.getByRole("dialog",{name:"Create project"});
  expect(within(dialog).getByRole(success?"status":"alert").textContent).toContain(formState.state.message);
  const link=within(dialog).queryByRole("link",{name:"Appoint project leadership"});
  expect(link?.getAttribute("href")??null).toBe(success?"/app/organisation-A/projects/created-project/overview":null);
});
