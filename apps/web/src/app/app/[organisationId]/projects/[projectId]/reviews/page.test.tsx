import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import ReviewsPage from "./page";
import {requireProject} from "@/lib/auth";
import {reviewRevision} from "@/app/app/workflow-actions";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/app/app/workflow-actions",()=>({reviewRevision:vi.fn()}));
vi.mock("@/components/revision-processing-status",()=>({RevisionProcessingStatus:()=> <span>Live processing status</span>}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("not found")}}));
let state:string,role:string,preview:unknown,error:unknown;
const page=()=>ReviewsPage({params:Promise.resolve({organisationId:"org",projectId:"project"})});
beforeEach(()=>{
  vi.clearAllMocks();state="ready";role="document_controller";preview=null;error=null;
  const query:Record<string,unknown>={then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({error,data:[{id:"revision",document_id:"document",revision_code:"R01",issue_status:"IFR",original_filename:"report.xlsx",native_original_filename:null,created_at:"2026-09-08",state,documents:{document_number:"ELE-001",title:"Electrical schedule",discipline:"Electrical"}}]}).then(resolve)};
  for(const method of ["select","eq","neq","order"])query[method]=vi.fn(()=>query);
  vi.mocked(requireProject).mockImplementation(async()=>({supabase:{from:()=>query},access:{role},preview} as never));
});
afterEach(cleanup);
it("enables secure preview and conformance only for a ready DCC submission",async()=>{
  render(await page());expect(screen.getByRole("link",{name:"Open secure preview"}).getAttribute("href")).toContain("/revisions/revision/preview");
  expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(false);
  expect((screen.getByRole("button",{name:"Approve submission"}) as HTMLButtonElement).disabled).toBe(false);
});
it.each(["quarantined","processing","failed"])("blocks viewing and conformance while %s",async(value)=>{
  state=value;render(await page());expect(screen.queryByRole("link",{name:"Open secure preview"})).toBeNull();expect(screen.queryByRole("link",{name:"Original file"})).toBeNull();
  expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);expect((screen.getByRole("button",{name:"Approve submission"}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Live processing status")).toBeTruthy();expect(screen.getByRole("link",{name:/Open document record/})).toBeTruthy();
});
it("allows viewing but never conformance changes in audited DCC preview",async()=>{
  preview={memberId:"dcc"};render(await page());expect(screen.getByRole("link",{name:"Open secure preview"})).toBeTruthy();expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
});
it("shows read errors instead of claiming there are no pending submissions",async()=>{
  error={code:"FAILED"};render(await page());expect(screen.getByRole("alert").textContent).toContain("could not be loaded");expect(screen.queryByRole("checkbox")).toBeNull();
});
it("rejects other project roles",async()=>{role="engineer";await expect(page()).rejects.toThrow("not found");expect(reviewRevision).not.toHaveBeenCalled();});
