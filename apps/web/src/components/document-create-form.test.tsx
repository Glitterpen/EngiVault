import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {DocumentCreateForm} from "./document-create-form";
import {createDocument,type MutationState} from "@/app/app/actions";

const formState=vi.hoisted(()=>({state:undefined as MutationState,pending:false,action:vi.fn(),hook:vi.fn()}));
vi.mock("react",async load=>({...await load<typeof import("react")>(),useActionState:(action:unknown,initial:unknown)=>{formState.hook(action,initial);return [formState.state,formState.action,formState.pending];}}));
vi.mock("@/app/app/actions",()=>({createDocument:vi.fn()}));
const disciplines=[{code:"PR",name:"Process"},{code:"ELE",name:"Electrical"}],documentTypes=[{code:"DRW",name:"Drawing"},{code:"RPT",name:"Report"}];
function fixture(bare?:boolean){return <DocumentCreateForm organisationId="organisation-A" projectId="project-A" disciplines={disciplines} documentTypes={documentTypes} bare={bare}/>;}
beforeEach(()=>{formState.state=undefined;formState.pending=false;vi.clearAllMocks();});
afterEach(()=>{expect(createDocument).not.toHaveBeenCalled();expect(formState.action).not.toHaveBeenCalled();cleanup();vi.restoreAllMocks();});

it.each([undefined,false,true])("preserves card/bare rendering, action and required metadata with bare=%s",bare=>{
  render(fixture(bare));const form=screen.getByRole("form",{name:"Register document"}) as HTMLFormElement;
  expect(form.classList.contains("ev-card")).toBe(!bare);expect(screen.getByRole("heading",{name:"Register document"})).toBeTruthy();expect(formState.hook).toHaveBeenCalledExactlyOnceWith(createDocument,undefined);
  for(const label of ["Document number","Title","Document type","Discipline","Agreed submission date"])expect((screen.getByLabelText(label) as HTMLInputElement|HTMLSelectElement).required).toBe(true);
  for(const label of ["Area (optional)","System (optional)","Work package (optional)"])expect((screen.getByLabelText(label) as HTMLInputElement).required).toBe(false);
  expect((screen.getByLabelText("Document type") as HTMLInputElement).maxLength).toBe(80);expect((screen.getByLabelText("Document number") as HTMLInputElement).maxLength).toBe(-1);expect(screen.getByLabelText("Agreed submission date").getAttribute("type")).toBe("date");
  expect(form.checkValidity()).toBe(false);expect((screen.getByLabelText("Discipline") as HTMLSelectElement).value).toBe("");
  expect(screen.getByRole("option",{name:"PR — Process"}).getAttribute("value")).toBe("Process");
});

it("preserves the exact document payload, including custom types and optional fields",()=>{
  render(fixture());const form=screen.getByRole("form",{name:"Register document"}) as HTMLFormElement;
  const values={"Document number":"EC-PR-001",Title:"Process basis","Document type":"Custom vendor data book",Discipline:"Electrical","Agreed submission date":"2026-10-30","Area (optional)":"Utilities","System (optional)":"Crude transfer","Work package (optional)":"WP-03"};
  for(const [label,value] of Object.entries(values))fireEvent.change(screen.getByLabelText(label),{target:{value}});
  expect(form.checkValidity()).toBe(true);expect(Object.fromEntries(new FormData(form))).toEqual({organisationId:"organisation-A",projectId:"project-A",documentNumber:"EC-PR-001",title:"Process basis",documentType:"Custom vendor data book",discipline:"Electrical",plannedSubmissionDate:"2026-10-30",area:"Utilities",system:"Crude transfer",workPackage:"WP-03"});
});

it("retains empty optional field keys and label associations without introducing new validation",()=>{
  render(fixture());const form=screen.getByRole("form",{name:"Register document"}) as HTMLFormElement;
  const data=new FormData(form);for(const key of ["area","system","workPackage"])expect(data.get(key)).toBe("");
  for(const label of ["Document number","Title","Discipline","Agreed submission date","Area (optional)","System (optional)","Work package (optional)"]){const input=screen.getByLabelText(label);expect(input.id).toBeTruthy();expect(document.querySelector(`label[for="${input.id}"]`)).toBeTruthy();}
});

it("keeps field IDs stable across renders and unique across forms",()=>{
  const view=render(<>{fixture()}{fixture(true)}</>);const ids=screen.getAllByLabelText("Title").map(input=>input.id);expect(new Set(ids).size).toBe(2);
  view.rerender(<>{fixture()}{fixture(true)}</>);expect(screen.getAllByLabelText("Title").map(input=>input.id)).toEqual(ids);
});

it("preserves pending gates while optional help remains keyboard accessible and non-submitting",()=>{
  formState.pending=true;render(fixture());expect(screen.getByRole("form",{name:"Register document"}).getAttribute("aria-busy")).toBe("true");expect((screen.getByRole("button",{name:"Registering…"}) as HTMLButtonElement).disabled).toBe(true);
  const help=screen.getByRole("button",{name:"First-submission date"});expect(help.getAttribute("type")).toBe("button");expect(help.closest("label")).toBeNull();expect((help as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(help);expect(screen.getByRole("tooltip").textContent).toContain("Date communicated by the originating engineer");expect((screen.getByLabelText("Title") as HTMLInputElement).disabled).toBe(false);
});

it("keeps returned document action feedback as an error, without inventing a successful record",()=>{
  formState.state={message:"That document number already exists."};render(fixture());expect(screen.getByRole("alert").textContent).toBe(formState.state.message);expect(screen.queryByRole("status")).toBeNull();expect(screen.getByRole("alert").className).toContain("[overflow-wrap:anywhere]");
});
