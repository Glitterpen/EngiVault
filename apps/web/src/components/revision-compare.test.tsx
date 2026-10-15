import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {RevisionCompare} from "./revision-compare";

const {router}=vi.hoisted(()=>({router:{push:vi.fn()}}));
vi.mock("next/navigation",()=>({useRouter:()=>router}));
const request=vi.fn();
const endpoint="/api/v1/organisations/org/projects/project/documents/document/comparisons";
const revisions=[{id:"revision-new",revision_code:"A02"},{id:"revision-old",revision_code:"A01"}];
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("fetch",request);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

it("does not show comparison with fewer than two revisions",()=>{
  render(<RevisionCompare endpoint={endpoint} revisions={revisions.slice(0,1)}/>);
  expect(screen.queryByRole("form")).toBeNull();
  expect(request).not.toHaveBeenCalled();
});
it("labels both revision controls and preserves their existing default selection and form names",()=>{
  render(<RevisionCompare endpoint={endpoint} revisions={revisions}/>);
  const base=screen.getByRole("combobox",{name:"Base revision"}) as HTMLSelectElement;
  const target=screen.getByRole("combobox",{name:"Target revision"}) as HTMLSelectElement;
  expect(base.value).toBe("revision-new");expect(target.value).toBe("revision-old");
  expect(base.required).toBe(true);expect(target.required).toBe(true);
  expect(base.classList.contains("min-h-11")).toBe(true);expect(target.classList.contains("min-h-11")).toBe(true);
  const form=screen.getByRole("form",{name:"Compare revisions"}) as HTMLFormElement;
  expect(Object.fromEntries(new FormData(form))).toEqual({base:"revision-new",target:"revision-old"});
  expect(form.classList.contains("ev-card")).toBe(false);
  expect(screen.getByRole("button",{name:"Compare side by side"}).classList.contains("min-h-11")).toBe(true);
  expect(request).not.toHaveBeenCalled();
});
it("retains the selected comparison payload and result URL",async()=>{
  request.mockResolvedValue(Response.json({comparisonId:"comparison-result"}));
  render(<RevisionCompare endpoint={endpoint} revisions={revisions}/>);
  fireEvent.change(screen.getByRole("combobox",{name:"Base revision"}),{target:{value:"revision-old"}});
  fireEvent.change(screen.getByRole("combobox",{name:"Target revision"}),{target:{value:"revision-new"}});
  await act(async()=>{fireEvent.submit(screen.getByRole("form",{name:"Compare revisions"}));});
  await waitFor(()=>expect(router.push).toHaveBeenCalledWith("/app/org/projects/project/documents/document/comparisons/comparison-result"));
  expect(request).toHaveBeenCalledWith(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({baseRevisionId:"revision-old",targetRevisionId:"revision-new"})});
});
it("announces comparison errors and keeps the chosen revisions",async()=>{
  request.mockResolvedValue(Response.json({error:{message:"Comparison could not be completed."}},{status:503}));
  render(<RevisionCompare endpoint={endpoint} revisions={revisions}/>);
  await act(async()=>{fireEvent.submit(screen.getByRole("form",{name:"Compare revisions"}));});
  await waitFor(()=>expect(screen.getByRole("status").textContent).toBe("Comparison could not be completed."));
  expect((screen.getByRole("combobox",{name:"Base revision"}) as HTMLSelectElement).value).toBe("revision-new");
  expect(router.push).not.toHaveBeenCalled();
  expect((screen.getByRole("button",{name:"Compare side by side"}) as HTMLButtonElement).disabled).toBe(false);
});
