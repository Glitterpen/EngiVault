import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {WorkPackageCreateForm} from "./work-package-create-form";
import {AdminPreviewBoundary} from "./admin-preview-boundary";
const {create}=vi.hoisted(()=>({create:vi.fn()}));
vi.mock("@/app/app/actions",()=>({createWorkPackage:create}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
const props={organisationId:"org",projectId:"project",disciplines:["Electrical","Process"]};
beforeEach(()=>{vi.clearAllMocks();});afterEach(cleanup);
it("preserves scoped hidden fields, required metadata, and existing scope/destination defaults",()=>{
  render(<WorkPackageCreateForm {...props}/>);
  const form=screen.getByRole("form",{name:/Package details/}) as HTMLFormElement;
  expect(Object.fromEntries(new FormData(form))).toEqual({organisationId:"org",projectId:"project",packageNumber:"",name:"",purpose:"",discipline:"",requiredStatus:"",destination:"local"});
  expect((screen.getByLabelText("Package number") as HTMLInputElement).required).toBe(true);expect((screen.getByLabelText("Package name") as HTMLInputElement).required).toBe(true);expect((screen.getByLabelText(/Purpose/) as HTMLInputElement).required).toBe(false);
  expect(screen.getByRole("option",{name:"Process"})).toBeTruthy();expect(screen.getByRole("button",{name:"Create and freeze package"}).classList.contains("min-h-11")).toBe(true);
});
it("opens a collapsed creation panel when native validation reports an invalid field",()=>{
  const {container}=render(<details><summary>Create frozen package</summary><WorkPackageCreateForm {...props}/></details>);
  fireEvent.invalid(screen.getByLabelText("Package number"));expect(container.querySelector("details")?.open).toBe(true);
});
it("preserves the selected creation payload and reveals returned errors even if the panel was closed",async()=>{
  create.mockResolvedValue({message:"That package number and version already exist."});
  const {container}=render(<details><summary>Create frozen package</summary><WorkPackageCreateForm {...props}/></details>);
  fireEvent.change(screen.getByLabelText("Package number"),{target:{value:"FWP-002"}});fireEvent.change(screen.getByLabelText("Package name"),{target:{value:"Final engineering package"}});fireEvent.change(screen.getByLabelText("Discipline scope"),{target:{value:"Process"}});
  await act(async()=>{fireEvent.submit(container.querySelector("form")!);});
  await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("already exist"));expect(container.querySelector("details")?.open).toBe(true);
  const submitted=create.mock.calls[0][1] as FormData;expect(submitted.get("packageNumber")).toBe("FWP-002");expect(submitted.get("discipline")).toBe("Process");expect(submitted.get("destination")).toBe("local");
});
it("continues to disable creation in audited preview",()=>{
  render(<AdminPreviewBoundary preview={{organisationId:"org",projectId:"project",role:"document_controller",displayName:"DCC",disciplines:[],expiresAt:"2099-01-01"}}><WorkPackageCreateForm {...props}/></AdminPreviewBoundary>);
  expect((screen.getByRole("button",{name:"Create and freeze package"}) as HTMLButtonElement).disabled).toBe(true);expect((screen.getByLabelText("Package number") as HTMLInputElement).disabled).toBe(true);
});
