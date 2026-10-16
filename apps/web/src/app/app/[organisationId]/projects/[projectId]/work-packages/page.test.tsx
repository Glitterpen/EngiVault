import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import WorkPackagesPage from "./page";
import {requireProject} from "@/lib/auth";
import {WorkPackageCreateForm} from "@/components/work-package-create-form";
import {WorkPackageList} from "@/components/work-package-list";

vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn((href:string)=>{throw new Error(`redirect:${href}`);})}));
vi.mock("@/components/help-tip",()=>({HelpTip:()=>null}));
vi.mock("@/components/work-package-create-form",()=>({WorkPackageCreateForm:vi.fn(()=> <div data-testid="create-package"/>)}));
vi.mock("@/components/work-package-list",()=>({WorkPackageList:vi.fn(()=> <div data-testid="package-history"/>)}));

const organisationId="a0000000-0000-4000-8000-000000000001";
const projectId="b0000000-0000-4000-8000-000000000001";
const base=`/app/${organisationId}/projects/${projectId}`;
type Result={data:unknown;error:unknown};
let results:Record<string,Result>;
let role:string;
let preview:unknown;
const from=vi.fn();
const rpc=vi.fn();
const queries=new Map<string,ReturnType<typeof query>>();

function query(result:Result){
  const builder={
    select:vi.fn(()=>builder),
    eq:vi.fn(()=>builder),
    order:vi.fn(()=>builder),
    then:<TResult1=Result,TResult2=never>(
      fulfilled?:((value:Result)=>TResult1|PromiseLike<TResult1>)|null,
      rejected?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null,
    )=>Promise.resolve(result).then(fulfilled,rejected),
  };
  return builder;
}
const page=()=>WorkPackagesPage({params:Promise.resolve({organisationId,projectId})});

beforeEach(()=>{
  vi.clearAllMocks();
  queries.clear();
  role="document_controller";
  preview=null;
  results={
    work_packages:{data:[
      {id:"recent",package_number:"TR-001",name:"Client issue",version:2,state:"ready",destination:"local",manifest:{kind:"document_transmittal",recipient:{company:"Client Ltd"}},created_at:"2026-10-16T08:00:00Z"},
      {id:"older",package_number:"FWP-002",name:"Mechanical handover",version:1,state:"failed",destination:"google_drive",manifest:null,created_at:"2026-10-15T08:00:00Z"},
    ],error:null},
    documents:{data:[{discipline:"Process"},{discipline:"Electrical"},{discipline:"Process"},{discipline:"Mechanical"}],error:null},
  };
  from.mockImplementation((table:string)=>{
    const builder=query(results[table]);
    queries.set(table,builder);
    return builder;
  });
  vi.mocked(requireProject).mockImplementation(async()=>({supabase:{from,rpc},access:{role},preview} as never));
});
afterEach(cleanup);

it("keeps DCC authority, tenant-scoped history reads and latest-first ordering",async()=>{
  render(await page());
  expect(requireProject).toHaveBeenCalledWith(organisationId,projectId);
  expect(from.mock.calls.map(([table])=>table).sort()).toEqual(["documents","work_packages"]);
  for(const builder of queries.values()){
    expect(builder.eq).toHaveBeenCalledWith("organisation_id",organisationId);
    expect(builder.eq).toHaveBeenCalledWith("project_id",projectId);
  }
  expect(queries.get("work_packages")?.select).toHaveBeenCalledWith("id,package_number,name,version,state,destination,manifest,created_at");
  expect(queries.get("work_packages")?.order).toHaveBeenCalledWith("created_at",{ascending:false});
  expect(rpc).not.toHaveBeenCalled();
});

it("passes complete package records to history without dropping non-ready records or manifest types",async()=>{
  render(await page());
  expect(vi.mocked(WorkPackageList).mock.calls[0][0]).toMatchObject({organisationId,projectId,packages:results.work_packages.data});
});

it("passes unique sorted MDR disciplines and the same tenant to the frozen-package form",async()=>{
  render(await page());
  expect(vi.mocked(WorkPackageCreateForm).mock.calls[0][0]).toEqual({organisationId,projectId,disciplines:["Electrical","Mechanical","Process"]});
});

it("keeps package creation mounted in a collapsed native disclosure",async()=>{
  render(await page());
  const details=screen.getByTestId("create-package").closest("details");
  expect(details).toBeTruthy();
  expect(details?.open).toBe(false);
  expect(details?.querySelector("summary")).toBeTruthy();
});

it("keeps transmittal creation and return navigation outside secondary disclosures",async()=>{
  render(await page());
  const transmittals=Array.from(document.querySelectorAll("a")).filter(link=>link.getAttribute("href")===`${base}/work-packages/transmittals/new`);
  expect(transmittals.length).toBeGreaterThan(0);
  expect(transmittals.every(link=>link.closest("details")===null)).toBe(true);
  expect(screen.getByRole("link",{name:"Document control centre"}).getAttribute("href")).toBe(`${base}/control`);
  expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
});

it("keeps the same DCC read scope in audited preview",async()=>{
  preview={targetUserId:"dcc-member"};
  render(await page());
  expect(screen.getByTestId("package-history")).toBeTruthy();
  expect(vi.mocked(WorkPackageCreateForm).mock.calls[0][0]).toMatchObject({organisationId,projectId});
  expect(rpc).not.toHaveBeenCalled();
});

it.each([
  ["engineer","assignments"],
  ["project_admin","overview"],
  ["organisation_admin","overview"],
  ["viewer","documents"],
  ["executive_viewer","documents"],
])("redirects %s before reading package or MDR data",async(nextRole,path)=>{
  role=nextRole;
  await expect(page()).rejects.toThrow(`redirect:${base}/${path}`);
  expect(from).not.toHaveBeenCalled();
  expect(WorkPackageCreateForm).not.toHaveBeenCalled();
  expect(WorkPackageList).not.toHaveBeenCalled();
});

it.each(["work_packages","documents"])("shows a safe retry instead of an empty history or creation form when %s fails",async(table)=>{
  results[table]={data:null,error:{message:"supabase internal_package secret=private-test-detail"}};
  render(await page());
  expect(screen.getByRole("heading",{name:"Work packages could not be loaded"})).toBeTruthy();
  expect(screen.getByRole("link",{name:"Retry securely"}).getAttribute("href")).toBe(`${base}/work-packages`);
  expect(screen.queryByTestId("create-package")).toBeNull();
  expect(screen.queryByTestId("package-history")).toBeNull();
  expect(document.body.textContent).not.toMatch(/supabase|internal_package|private-test-detail/);
});

it("passes an honestly empty successful history and discipline list",async()=>{
  results.work_packages={data:[],error:null};
  results.documents={data:[],error:null};
  render(await page());
  expect(vi.mocked(WorkPackageList).mock.calls[0][0]).toMatchObject({packages:[]});
  expect(vi.mocked(WorkPackageCreateForm).mock.calls[0][0]).toMatchObject({disciplines:[]});
  expect(screen.queryByRole("heading",{name:"Work packages could not be loaded"})).toBeNull();
});
