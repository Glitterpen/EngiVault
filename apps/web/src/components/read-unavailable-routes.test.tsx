import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,render,screen,within} from "@testing-library/react";
import AuditPage from "@/app/app/[organisationId]/audit/page";
import SubscriptionPage from "@/app/app/[organisationId]/subscription/page";
import CategorySettingsPage from "@/app/app/[organisationId]/settings/document-categories/page";
import DocumentPage from "@/app/app/[organisationId]/projects/[projectId]/documents/[documentId]/page";
import PackagePage from "@/app/app/[organisationId]/projects/[projectId]/work-packages/[packageId]/page";
import ComparisonPage from "@/app/app/[organisationId]/projects/[projectId]/documents/[documentId]/comparisons/[comparisonId]/page";
import InvitePage from "@/app/invite/[token]/page";

const mocks=vi.hoisted(()=>({requireUser:vi.fn(),requireProject:vi.fn(),getUser:vi.fn(),from:vi.fn(),rpc:vi.fn(),schedules:vi.fn(),switchAccount:vi.fn(),checkout:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireUser:mocks.requireUser,requireProject:mocks.requireProject}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:mocks.getUser},rpc:mocks.rpc,from:mocks.from})}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("NEXT_NOT_FOUND");},redirect:(path:string)=>{throw new Error(`REDIRECT:${path}`);}}));
vi.mock("@/lib/paystack",()=>({isPaystackCheckoutConfigured:mocks.checkout}));
vi.mock("@/lib/billing",()=>({ORGANISATION_TRIAL_DAYS:90,trialDaysRemaining:()=>0}));
vi.mock("@/lib/document-schedule",()=>({loadDocumentSchedules:mocks.schedules}));
vi.mock("@/app/app/actions",()=>({toggleDocumentCategory:vi.fn()}));
vi.mock("@/app/invite/[token]/actions",()=>({switchInvitationAccount:mocks.switchAccount}));
vi.mock("@/components/help-tip",()=>({HelpTip:()=>null}));
vi.mock("@/components/document-category-create-form",()=>({DocumentCategoryCreateForm:()=><div data-testid="create-category">Create category</div>}));
vi.mock("@/components/revision-upload",()=>({RevisionUpload:({completedIssueStatuses}:{completedIssueStatuses:string[]})=><div data-testid="upload" data-completed={JSON.stringify(completedIssueStatuses)}>Secure upload</div>}));
vi.mock("@/components/incomplete-upload-recovery",()=>({IncompleteUploadRecovery:()=><div data-testid="resume">Resume upload</div>}));
vi.mock("@/components/revision-processing-status",()=>({RevisionProcessingStatus:({canRetry}:{canRetry:boolean})=><div data-testid="processing" data-retry={String(canRetry)}>Processing status</div>}));
vi.mock("@/components/revision-compare",()=>({RevisionCompare:()=><div>Compare revisions</div>}));
vi.mock("@/components/record-admin-forms",()=>({DocumentAdminForm:()=><div data-testid="edit-document">Edit document</div>}));
vi.mock("@/components/document-plan-form",()=>({DocumentPlanForm:()=><div>Edit plan</div>}));
vi.mock("@/components/document-issue-schedule",()=>({DocumentIssueSchedule:()=><div>Issue schedule</div>}));
vi.mock("@/components/document-assignment-manager",()=>({DocumentAssignmentManager:()=><div>Assign engineers</div>}));
vi.mock("@/components/work-package-generate",()=>({WorkPackageGenerate:()=><button>Generate package ZIP</button>}));

type ReadResult={data:unknown;error?:{code:string;message:string}|null};
type Read={source:string;filters:[string,unknown][];orders:string[];limit?:number};
const params={organisationId:"org",projectId:"project",documentId:"document",packageId:"package",comparisonId:"comparison"};
const error={code:"XX000",message:"Internal Supabase Railway secret backend failure"};
let results:Record<string,ReadResult>,reads:Read[],role:string,preview:unknown;

function query(source:string){
  const read:Read={source,filters:[],orders:[]};reads.push(read);
  const result=results[source]??{data:[]};
  const promise=Promise.resolve(result);
  const chain={
    select:()=>chain,
    eq:(column:string,value:unknown)=>{read.filters.push([column,value]);return chain;},
    in:(column:string,value:unknown)=>{read.filters.push([column,value]);return chain;},
    order:(column:string)=>{read.orders.push(column);return chain;},
    limit:(value:number)=>{read.limit=value;return chain;},
    maybeSingle:async()=>({...result,data:Array.isArray(result.data)?result.data[0]??null:result.data}),
    then:promise.then.bind(promise),
  };
  return chain;
}
function baseParams(){return Promise.resolve(params);}
function subscription(){results.get_my_organisations={data:[{organisation_id:"org",role:"organisation_admin"}]};return SubscriptionPage({params:baseParams(),searchParams:Promise.resolve({})});}
function document(){return DocumentPage({params:baseParams()});}
function comparison(){return ComparisonPage({params:baseParams()});}
function packagePage(){return PackagePage({params:baseParams()});}
function unavailable(title:string,href:string){
  const alert=screen.getByRole("alert");
  expect(within(alert).getByRole("heading",{level:1,name:title})).toBeTruthy();
  const retry=within(alert).getByRole("link",{name:"Retry loading"});
  expect(retry.getAttribute("href")).toBe(href);
  expect(retry.hasAttribute("data-preview-safe")).toBe(true);
  expect(alert.textContent).not.toMatch(/Supabase|Railway|secret|XX000/);
}

beforeEach(()=>{
  vi.clearAllMocks();reads=[];role="engineer";preview=null;
  results={
    get_my_organisations:{data:[{organisation_id:"org",role:"organisation_admin"}]},
    audit_events:{data:[]},document_categories:{data:[]},
    subscriptions:{data:{status:"active",plans:{name:"Team plan",entitlements:{projects:5,members:20,storage_bytes:1073741824,monthly_ai_tokens:5000}}}},
    billing_customers:{data:null},usage_ledger:{data:[{metric:"ai_tokens",quantity:123},{metric:"ai_tokens",quantity:7}]},
    documents:{data:{id:"document",title:"Process basis",document_number:"PR-001",discipline:"Process",document_type:"Report",status:"draft",lifecycle_status:"active"}},
    projects:{data:{delivery_stage:"feed"}},can_upload_document:{data:true},get_project_team:{data:[]},document_assignments:{data:[]},
    document_revisions:{data:[]},processing_runs:{data:[]},
    work_packages:{data:{name:"Handover",state:"ready",package_number:"WP-001",version:1,destination:"client_review",manifest:{included:1,exceptions:0}}},
    work_package_items:{data:[]},
    revision_comparisons:{data:{id:"comparison",state:"ready",base_revision_id:"base",target_revision_id:"target",summary:{added:0,removed:0,changed:0}}},
    comparison_changes:{data:[]},
    accept_workspace_invitation:{data:null,error},
  };
  mocks.from.mockImplementation(query);mocks.rpc.mockImplementation(query);
  mocks.requireUser.mockImplementation(async()=>({supabase:{from:mocks.from,rpc:mocks.rpc}}));
  mocks.requireProject.mockImplementation(async()=>({supabase:{from:mocks.from,rpc:mocks.rpc},access:{role},user:{id:"engineer"},preview}));
  mocks.getUser.mockResolvedValue({data:{user:{id:"engineer",email:"engineer@example.test"}}});
  mocks.checkout.mockReturnValue(true);
  mocks.schedules.mockResolvedValue(new Map([["document",{document_id:"document",next_submission_date:null,deadline_kind:"first_issue",overdue:false}]]));
});
afterEach(cleanup);

describe("organisation read failures are not empty data or denied access",()=>{
  it("keeps audit access failures distinct from a confirmed non-administrator",async()=>{
    results.get_my_organisations={data:null,error};render(await AuditPage({params:baseParams(),searchParams:Promise.resolve({})}));
    unavailable("Audit access could not be checked","/app/org/audit");expect(mocks.from).not.toHaveBeenCalled();
    cleanup();results.get_my_organisations={data:[{organisation_id:"org",role:"member"}]};
    await expect(AuditPage({params:baseParams(),searchParams:Promise.resolve({})})).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("preserves the audit filter on retry and does not claim an empty log after failure",async()=>{
    results.audit_events={data:null,error};render(await AuditPage({params:baseParams(),searchParams:Promise.resolve({action:"revision.upload_completed"})}));
    unavailable("Audit log is temporarily unavailable","/app/org/audit?action=revision.upload_completed");
    expect(screen.queryByText(/No audit events/)).toBeNull();
    expect(reads.find(r=>r.source==="audit_events")).toMatchObject({filters:[["organisation_id","org"],["action","revision.upload_completed"]],orders:["created_at"],limit:200});
  });
  it("only shows the audit empty state after a successful empty read",async()=>{
    render(await AuditPage({params:baseParams(),searchParams:Promise.resolve({})}));
    expect(screen.getByText("No audit events are recorded yet.")).toBeTruthy();expect(screen.queryByRole("alert")).toBeNull();
  });
  it.each(["get_my_organisations","document_categories"])("does not offer category writes when %s cannot be read",async source=>{
    results[source]={data:null,error};render(await CategorySettingsPage({params:baseParams()}));
    unavailable(source==="get_my_organisations"?"Category access could not be checked":"Document categories are temporarily unavailable","/app/org/settings/document-categories");
    expect(screen.queryByTestId("create-category")).toBeNull();expect(screen.queryByRole("button",{name:/Enable|Disable/})).toBeNull();
  });
  it("retains category creation for a genuinely empty register and the existing toggle payload",async()=>{
    const first=render(await CategorySettingsPage({params:baseParams()}));expect(screen.getByText("No document categories are registered yet.")).toBeTruthy();expect(screen.getByTestId("create-category")).toBeTruthy();
    first.unmount();results.document_categories={data:[{id:"category",kind:"discipline",code:"PR",name:"Process",is_active:true}]};
    const {container}=render(await CategorySettingsPage({params:baseParams()}));const toggle=screen.getByRole("button",{name:"Disable"}).closest("form")!;
    expect(Array.from(new FormData(toggle).entries())).toEqual([["organisationId","org"],["categoryId","category"],["isActive","false"]]);expect(container.querySelectorAll("form")).toHaveLength(1);
  });
  it("retains not-found for confirmed category access denial",async()=>{
    results.get_my_organisations={data:[]};await expect(CategorySettingsPage({params:baseParams()})).rejects.toThrow("NEXT_NOT_FOUND");expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("billing does not invent plan or usage figures",()=>{
  it("does not turn a failed access check into not-found",async()=>{
    results.get_my_organisations={data:null,error};render(await SubscriptionPage({params:baseParams(),searchParams:Promise.resolve({checkout:"paystack-success",billing:"pending"})}));
    unavailable("Billing access could not be checked","/app/org/subscription?checkout=paystack-success&billing=pending");expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each(["subscriptions","billing_customers","usage_ledger"])("withholds fallback figures and checkout when %s fails",async source=>{
    results[source]={data:null,error};const {container}=render(await subscription());
    unavailable("Subscription information is temporarily unavailable","/app/org/subscription");
    expect(screen.queryByText("EngiCite Trial")).toBeNull();expect(screen.queryByText("0 tokens")).toBeNull();expect(container.querySelector("form")).toBeNull();
  });
  it("shows real plan and summed usage after successful reads without altering checkout",async()=>{
    const {container}=render(await subscription());expect(screen.getByRole("heading",{name:"Team plan"})).toBeTruthy();expect(screen.getByText("130 tokens")).toBeTruthy();
    expect(container.querySelector('form[action="/api/v1/organisations/org/billing/paystack/checkout"]')?.getAttribute("method")).toBe("post");
  });
  it("distinguishes a genuinely absent subscription from a trial",async()=>{
    results.subscriptions={data:null};const {container}=render(await subscription());expect(screen.getByRole("heading",{name:"No plan assigned"})).toBeTruthy();expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector('form[action="/api/v1/organisations/org/billing/paystack/checkout"]')).toBeTruthy();
  });
  it.each([null,[],{name:"Team plan",entitlements:null}])("does not present unknown plan capacity as verified zeros (%j)",async plans=>{
    results.subscriptions={data:{status:"active",plans}};const {container}=render(await subscription());
    unavailable("Plan details are temporarily unavailable","/app/org/subscription");expect(screen.queryByText("0 GB")).toBeNull();expect(container.querySelector("form")).toBeNull();
  });
  it("distinguishes an unknown entitlement from an explicit zero allowance",async()=>{
    results.subscriptions={data:{status:"active",plans:{name:"Team plan",entitlements:{projects:0}}}};render(await subscription());
    expect(screen.getByText("Active projects").previousElementSibling?.textContent).toBe("0");
    for(const label of ["Team members","Secure storage","Monthly AI tokens"])expect(screen.getByText(label).previousElementSibling?.textContent).toBe("Not available");
  });
});

describe("document reads do not disguise submissions as missing",()=>{
  it.each([
    ["documents","Document information is temporarily unavailable"],
    ["projects","Project issue requirements are temporarily unavailable"],
    ["can_upload_document","Document access could not be checked"],
    ["document_revisions","Revision history is temporarily unavailable"],
  ])("stops misleading upload and history UI after a %s failure",async(source,title)=>{
    results[source]={data:null,error};render(await document());unavailable(title,"/app/org/projects/project/documents/document");
    expect(screen.queryByText("No revisions uploaded.")).toBeNull();expect(screen.queryByTestId("upload")).toBeNull();expect(screen.queryByTestId("processing")).toBeNull();
  });
  it("keeps missing documents and confirmed engineer access denial as not-found",async()=>{
    results.documents={data:null};await expect(document()).rejects.toThrow("NEXT_NOT_FOUND");
    results.documents={data:{id:"document"}};results.can_upload_document={data:false};await expect(document()).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("does not silently replace missing processing reads with empty runs",async()=>{
    results.document_revisions={data:[{id:"revision"}]};results.processing_runs={data:null,error};render(await document());
    unavailable("Revision processing status is temporarily unavailable","/app/org/projects/project/documents/document");expect(screen.queryByTestId("processing")).toBeNull();
  });
  it.each(["get_project_team","document_assignments"])("does not invent eligible or unassigned engineers after %s fails",async source=>{
    role="document_controller";results[source]={data:null,error};render(await document());unavailable("Deliverable assignments are temporarily unavailable","/app/org/projects/project/documents/document");
  });
  it("keeps a successful empty revision history and the original engineer upload gate",async()=>{
    render(await document());expect(screen.getByText("No revisions uploaded.")).toBeTruthy();expect(screen.getByTestId("upload")).toBeTruthy();expect(screen.queryByTestId("edit-document")).toBeNull();
  });
  it("retains accepted milestone data for the existing upload workflow",async()=>{
    results.document_revisions={data:[{id:"revision",revision_code:"R01",issue_status:"Issued for Review (IFR)",state:"ready",control_status:"accepted",original_filename:"basis.pdf",byte_size:100,submission_version:1}]};
    render(await document());expect(screen.getByTestId("upload").getAttribute("data-completed")).toBe('["Issued for Review (IFR)"]');expect(screen.getByTestId("processing").getAttribute("data-retry")).toBe("false");
    expect(screen.getByRole("link",{name:"Preview revision R01"}).getAttribute("href")).toContain("/revisions/revision/preview");
  });
  it("keeps management redirected before document reads",async()=>{
    role="project_admin";await expect(document()).rejects.toThrow("REDIRECT:");expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("work package reads distinguish missing files from missing data",()=>{
  it.each([["work_packages","Work package is temporarily unavailable"],["work_package_items","Package documents are temporarily unavailable"]])("shows a safe retry for a failed %s read",async(source,title)=>{
    results[source]={data:null,error};const {container}=render(await packagePage());unavailable(title,"/app/org/projects/project/work-packages/package");
    expect(screen.queryByText("0 documents")).toBeNull();expect(screen.queryByText("No documents are recorded in this package.")).toBeNull();expect(screen.queryByRole("button",{name:/Generate/})).toBeNull();expect(container.querySelector("form")).toBeNull();
  });
  it("retains not-found for a successfully confirmed missing package",async()=>{
    results.work_packages={data:null};await expect(packagePage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("comparison result integrity and read-only refresh",()=>{
  it.each([
    ["revision_comparisons","Comparison information is temporarily unavailable"],
    ["document_revisions","Comparison revision details are temporarily unavailable"],
    ["comparison_changes","Comparison results are temporarily unavailable"],
  ])("does not show zero counts or no-change conclusions when %s fails",async(source,title)=>{
    results[source]={data:null,error};render(await comparison());unavailable(title,"/app/org/projects/project/documents/document/comparisons/comparison");
    expect(screen.queryByText(/^0$/)).toBeNull();expect(screen.queryByText(/No extracted-text changes detected/)).toBeNull();
  });
  it.each(["queued","processing"])("offers only a status refresh while %s, without loading a premature change list",async state=>{
    Object.assign(results.revision_comparisons.data!,{state});const {container}=render(await comparison());
    expect(screen.getByRole("status").textContent).toContain("Zero counts are not shown until then.");
    expect(screen.getByRole("link",{name:"Refresh comparison status"}).getAttribute("href")).toBe("/app/org/projects/project/documents/document/comparisons/comparison");
    expect(reads.some(r=>r.source==="comparison_changes")).toBe(false);expect(container.querySelector("form,button")).toBeNull();
  });
  it("explains failed comparisons without promising processing will complete or retrying a job",async()=>{
    Object.assign(results.revision_comparisons.data!,{state:"failed"});const {container}=render(await comparison());
    expect(screen.getByRole("alert").textContent).toContain("No verified comparison results are available.");expect(screen.queryByText(/Results will appear after/)).toBeNull();
    expect(screen.getByRole("link",{name:"Refresh comparison status"})).toBeTruthy();expect(container.querySelector("form,button")).toBeNull();expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("only shows a no-change result after successful ready reads with real zero counts",async()=>{
    render(await comparison());expect(screen.getAllByText(/^0$/)).toHaveLength(3);expect(screen.getByText(/No extracted-text changes detected/)).toBeTruthy();expect(screen.queryByRole("alert")).toBeNull();
  });
  it("does not fabricate counts when a ready result has no summary values",async()=>{
    Object.assign(results.revision_comparisons.data!,{summary:null});render(await comparison());expect(screen.getAllByText("Not available")).toHaveLength(3);expect(screen.queryByText(/^0$/)).toBeNull();
  });
  it("retains not-found for a genuinely absent comparison",async()=>{
    results.revision_comparisons={data:null};await expect(comparison()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("invitation operational errors are not wrong-account guidance",()=>{
  it.each(["XX000","PGRST000","42501"])("keeps a signed-in user on a safe retry after operational error %s",async code=>{
    results.accept_workspace_invitation={data:null,error:{code,message:error.message}};const {container}=render(await InvitePage({params:Promise.resolve({token:"test-token"})}));
    unavailable("Invitation could not be checked","/invite/test-token");expect(screen.getByRole("link",{name:"Return to current workspace"}).getAttribute("href")).toBe("/app");
    expect(screen.queryByRole("heading",{name:"Use the invited account"})).toBeNull();expect(container.querySelector("form")).toBeNull();expect(mocks.switchAccount).not.toHaveBeenCalled();
  });
  it.each([
    ["42501","invitation unavailable"],
    ["42501","inviter no longer has authority; request a fresh invitation"],
    ["22023","invitation discipline unavailable"],
    ["23505","active project role differs from invitation"],
  ])("keeps expected denial %s neutral and account switching optional",async(code,message)=>{
    results.accept_workspace_invitation={data:null,error:{code,message}};render(await InvitePage({params:Promise.resolve({token:"test-token"})}));
    expect(screen.getByRole("heading",{name:"Invitation unavailable"})).toBeTruthy();expect(screen.queryByRole("heading",{name:"Use the invited account"})).toBeNull();
    expect(screen.getByText(/may have expired, been revoked or already been used/)).toBeTruthy();expect(screen.getByRole("button",{name:"Sign out and use invited email"}).closest("form")).toBeTruthy();
  });
});
