import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,render,screen,within} from "@testing-library/react";
import PackagePage from "./page";
import {requireProject} from "@/lib/auth";
import {WorkPackageGenerate} from "@/components/work-package-generate";

vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("next/navigation",()=>({notFound:vi.fn(()=>{throw new Error("NEXT_NOT_FOUND");})}));
vi.mock("@/components/work-package-generate",()=>({WorkPackageGenerate:vi.fn(({endpoint,label,loadingLabel}:{endpoint:string;label:string;loadingLabel:string})=><button data-endpoint={endpoint} data-loading-label={loadingLabel}>{label}</button>)}));

type QueryRead={table:string;selection:string;filters:[string,unknown][];orders:string[]};
type Query={select:(selection:string)=>Query;eq:(column:string,value:unknown)=>Query;order:(column:string)=>Query;maybeSingle:()=>Promise<{data:unknown}>;then:Promise<{data:unknown}>["then"]};
type Manifest={kind?:string;included?:number;exceptions?:number;recipient?:{company?:string;contact?:string};issuer?:{name?:string;email?:string};acknowledgement?:{status?:string};message?:string;electronic_seal?:{status?:string;qualification?:string}};
type Pack={package_number:string;version:number;name:string;state:string;destination:string;purpose:string;manifest:Manifest|null};
const params={organisationId:"org",projectId:"project",packageId:"package"};
const endpoint="/api/v1/organisations/org/projects/project/work-packages/package";
let pack:Pack|null,items:{id:string;document_number:string;discipline:string;document_type:string;revision_code:string|null;issue_status:string|null;inclusion_state:string}[];
let reads:QueryRead[];
const from=vi.fn();
beforeEach(()=>{
  vi.clearAllMocks();reads=[];
  pack={package_number:"WP-001",version:2,name:"Process handover",state:"ready",destination:"client_review",purpose:"Review",manifest:{included:2,exceptions:1}};
  items=[{id:"one",document_number:"ENG-PROC-001",discipline:"Process",document_type:"Report",revision_code:"R01",issue_status:"Issued for Review (IFR)",inclusion_state:"included"},{id:"two",document_number:"ENG-ELEC-002",discipline:"Electrical",document_type:"Drawing",revision_code:null,issue_status:null,inclusion_state:"missing_revision"}];
  from.mockImplementation((table:string)=>{
    const read:QueryRead={table,selection:"",filters:[],orders:[]};reads.push(read);
    const promise=Promise.resolve({data:table==="work_packages"?pack:items});
    const query:Query={select:selection=>{read.selection=selection;return query;},eq:(column,value)=>{read.filters.push([column,value]);return query;},order:column=>{read.orders.push(column);return query;},maybeSingle:()=>promise,then:promise.then.bind(promise)};
    return query;
  });
  vi.mocked(requireProject).mockResolvedValue({supabase:{from}} as never);
});
afterEach(cleanup);
const page=()=>PackagePage({params:Promise.resolve(params)});
const renderPage=async()=>render(await page());
function transmittal(manifest:Partial<Manifest>={}){
  pack!.manifest={kind:"document_transmittal",included:2,exceptions:1,recipient:{company:"Client organisation",contact:"Client recipient"},issuer:{name:"Project DCC",email:"dcc@example.test"},acknowledgement:{status:"awaiting_client"},message:"Please acknowledge receipt.",...manifest};
}

describe("package detail scope and generation gates",()=>{
  it("retains the authenticated project, scoped package query and ordered frozen items",async()=>{
    await renderPage();
    expect(requireProject).toHaveBeenCalledExactlyOnceWith("org","project");
    expect(reads).toEqual([{table:"work_packages",selection:"*",filters:[["id","package"],["organisation_id","org"],["project_id","project"]],orders:[]},{table:"work_package_items",selection:"*",filters:[["work_package_id","package"]],orders:["discipline","document_number"]}]);
    expect(screen.getByRole("heading",{level:1,name:"Process handover"})).toBeTruthy();
    expect(screen.getByRole("link",{name:"Transmittals & work packages"}).getAttribute("href")).toBe("/app/org/projects/project/work-packages");
    expect(screen.getByRole("link",{name:"Download package"}).getAttribute("href")).toBe(`${endpoint}/download`);
    expect(screen.queryByRole("button",{name:/Generate/})).toBeNull();
  });
  it("does not render a missing package",async()=>{pack=null;await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");});
  it.each(["frozen","failed"])("retains the generation endpoint for %s packages",async state=>{
    pack!.state=state;await renderPage();
    expect(screen.queryByRole("link",{name:"Download package"})).toBeNull();
    expect(vi.mocked(WorkPackageGenerate).mock.calls[0][0]).toMatchObject({endpoint:`${endpoint}/generate`,label:"Generate package ZIP",loadingLabel:"Building secure ZIP…"});
  });
  it.each(["draft","building","processing","cancelled"])("does not expose download or generation in state %s",async state=>{
    pack!.state=state;await renderPage();
    expect(screen.queryByRole("link",{name:/Download/})).toBeNull();expect(WorkPackageGenerate).not.toHaveBeenCalled();
  });
  it("retains transmittal-specific generation and download labels",async()=>{
    transmittal();pack!.state="frozen";
    const view=await renderPage();
    expect(screen.getByRole("heading",{name:"Client document transmittal"})).toBeTruthy();
    expect(vi.mocked(WorkPackageGenerate).mock.calls[0][0]).toMatchObject({endpoint:`${endpoint}/generate`,label:"Generate transmittal ZIP",loadingLabel:"Preparing transmittal and documents…"});
    view.unmount();pack!.state="ready";
    await renderPage();
    expect(screen.getByRole("link",{name:"Download transmittal ZIP"}).getAttribute("href")).toBe(`${endpoint}/download`);
  });
});

describe("responsive package contents and issue details",()=>{
  it("keeps every frozen item and readiness exception in a labelled document list",async()=>{
    const {container}=await renderPage();
    const documents=screen.getByRole("region",{name:"Package documents"});
    expect(within(documents).getAllByRole("listitem")).toHaveLength(2);
    expect(within(documents).getByRole("heading",{name:"ENG-PROC-001"})).toBeTruthy();
    expect(within(documents).getByText("Issued for Review (IFR)")).toBeTruthy();
    expect(within(documents).getByText("missing revision")).toBeTruthy();
    expect(within(documents).getByText("included")).toBeTruthy();
    expect(container.querySelector('[class*="min-w-[850px]"]')).toBeNull();
    const summary=screen.getByLabelText("Package summary");
    expect(within(summary).getByText("Included").nextElementSibling?.textContent).toBe("2");
    expect(within(summary).getByText("Exceptions").nextElementSibling?.textContent).toBe("1");
    expect(within(summary).getByText("Destination").nextElementSibling?.textContent).toBe("client review");
  });
  it("shows a clear empty package without inventing any included documents",async()=>{
    items=[];pack!.manifest=null;await renderPage();
    expect(screen.getByText("No documents are recorded in this package.")).toBeTruthy();
    expect(screen.getByText("0 documents")).toBeTruthy();
  });
  it("collapses optional recipient details while keeping system-attestation limits visible",async()=>{
    transmittal();await renderPage();
    const details=screen.getByText("Recipient & issue details").closest("details");
    expect(details?.open).toBe(false);
    expect(within(details!).getByText("Client recipient")).toBeTruthy();
    expect(within(details!).getByText("dcc@example.test")).toBeTruthy();
    expect(within(details!).getByText("Please acknowledge receipt.")).toBeTruthy();
    const seal=screen.getByRole("region",{name:"Seal qualification"});
    expect(seal.closest("details")).toBeNull();
    expect(seal.textContent).toContain("This is not a qualified electronic signature or seal.");
  });
  it("only asserts qualified status for a provider-verified qualified seal",async()=>{
    transmittal({electronic_seal:{status:"qualified_electronic_seal",qualification:"provider_verified"}});await renderPage();
    expect(screen.getByRole("region",{name:"Seal qualification"}).textContent).toContain("provider-verified qualified certificate");
  });
  it("does not assert qualified status for an ordinary electronic seal",async()=>{
    transmittal({electronic_seal:{status:"electronic_seal",qualification:"provider_verified"}});await renderPage();
    expect(screen.getByRole("region",{name:"Seal qualification"}).textContent).toContain("has not asserted qualified status");
  });
  it.each([undefined,"unverified"])("does not claim qualification from an unverified qualified-seal label (%s)",async qualification=>{
    transmittal({electronic_seal:{status:"qualified_electronic_seal",qualification}});await renderPage();
    expect(screen.getByRole("region",{name:"Seal qualification"}).textContent).toContain("system attestation only");
  });
  it("does not show client acknowledgement or seal assertions for an ordinary work package",async()=>{
    await renderPage();expect(screen.queryByText("Recipient & issue details")).toBeNull();expect(screen.queryByRole("region",{name:"Seal qualification"})).toBeNull();
  });
});
