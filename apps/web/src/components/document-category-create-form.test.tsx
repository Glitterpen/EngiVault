import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {DocumentCategoryCreateForm} from "./document-category-create-form";
import {createDocumentCategory,type MutationState} from "@/app/app/actions";

const state=vi.hoisted(()=>({value:undefined as MutationState,pending:false,action:vi.fn(),hook:vi.fn()}));
vi.mock("react",async load=>({...await load<typeof import("react")>(),useActionState:(action:unknown,initial:unknown)=>{state.hook(action,initial);return [state.value,state.action,state.pending];}}));
vi.mock("@/app/app/actions",()=>({createDocumentCategory:vi.fn()}));
beforeEach(()=>{state.value=undefined;state.pending=false;vi.clearAllMocks();});
afterEach(()=>{expect(createDocumentCategory).not.toHaveBeenCalled();expect(state.action).not.toHaveBeenCalled();cleanup();});

it("preserves the category action, default kind, payload and existing validation limits",()=>{
  render(<DocumentCategoryCreateForm organisationId="organisation-A"/>);
  const form=screen.getByRole("form",{name:"Add a category"}) as HTMLFormElement;
  const kind=screen.getByRole("combobox",{name:"Category kind"}) as HTMLSelectElement;
  const code=screen.getByRole("textbox",{name:"Short code"}) as HTMLInputElement;
  const name=screen.getByRole("textbox",{name:"Display name"}) as HTMLInputElement;
  expect(state.hook).toHaveBeenCalledExactlyOnceWith(createDocumentCategory,undefined);
  expect(kind.value).toBe("discipline");expect(Array.from(kind.options).map(option=>option.value)).toEqual(["discipline","document_type"]);
  expect(code.required).toBe(true);expect(code.maxLength).toBe(24);expect(code.placeholder).toBe("ROT");
  expect(name.required).toBe(true);expect(name.maxLength).toBe(80);expect(name.placeholder).toBe("Rotating Equipment");
  expect(form.checkValidity()).toBe(false);
  fireEvent.change(kind,{target:{value:"document_type"}});fireEvent.change(code,{target:{value:"DWG"}});fireEvent.change(name,{target:{value:"General arrangement drawing"}});
  expect(form.checkValidity()).toBe(true);
  expect(Object.fromEntries(new FormData(form))).toEqual({organisationId:"organisation-A",kind:"document_type",code:"DWG",name:"General arrangement drawing"});
});

it("provides explicit unique labels, 44px controls and local visible keyboard focus",()=>{
  render(<><DocumentCategoryCreateForm organisationId="A"/><DocumentCategoryCreateForm organisationId="B"/></>);
  const controls=[...screen.getAllByLabelText("Category kind"),...screen.getAllByLabelText("Short code"),...screen.getAllByLabelText("Display name")];
  expect(new Set(controls.map(control=>control.id)).size).toBe(6);
  for(const control of controls){expect(control.id).toBeTruthy();expect(control.className).toContain("min-h-11");expect(control.className).toContain("min-w-0");expect(control.className).toContain("focus-visible:outline-[#10243e]");}
  const button=screen.getAllByRole("button",{name:"Add category"})[0];button.focus();expect(document.activeElement).toBe(button);expect(button.getAttribute("type")).toBe("submit");
});

it("announces pending creation and disables submission without changing field availability",()=>{
  state.pending=true;render(<DocumentCategoryCreateForm organisationId="A"/>);
  expect(screen.getByRole("form",{name:"Add a category"}).getAttribute("aria-busy")).toBe("true");expect((screen.getByRole("button",{name:"Adding…"}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText("Short code") as HTMLInputElement).disabled).toBe(false);
});

it("keeps failed action feedback visible as an alert and wraps long messages",()=>{
  state.value={message:"That category code already exists."};render(<DocumentCategoryCreateForm organisationId="A"/>);
  const alert=screen.getByRole("alert");expect(alert.textContent).toBe(state.value.message);expect(alert.className).toContain("[overflow-wrap:anywhere]");expect(alert.className).toContain("text-[#a5452f]");
  expect(screen.queryByRole("status")).toBeNull();
});

it("keeps successful feedback as a status message without exposing a new mutation",()=>{
  state.value={message:"Category added."};render(<DocumentCategoryCreateForm organisationId="A"/>);
  expect(screen.getByRole("status").textContent).toBe(state.value.message);expect(screen.queryByRole("alert")).toBeNull();expect(screen.getAllByRole("button")).toHaveLength(1);
});
