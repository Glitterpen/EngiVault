import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import AllDocumentsPage from "@/app/app/documents/page";
import SearchPage from "@/app/app/[organisationId]/projects/[projectId]/search/page";
import ChatPage from "@/app/app/[organisationId]/projects/[projectId]/chat/page";

const mocks=vi.hoisted(()=>({requireUser:vi.fn(),requireProject:vi.fn(),from:vi.fn(),rpc:vi.fn(),search:vi.fn(),chat:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireUser:mocks.requireUser,requireProject:mocks.requireProject}));
vi.mock("@/components/help-tip",()=>({HelpTip:()=>null}));
vi.mock("@/components/project-search",()=>({ProjectSearch:(props:unknown)=>{mocks.search(props);return <div>Search fixture</div>;}}));
vi.mock("@/components/project-chat",()=>({ProjectChat:(props:{revisions:unknown[]})=>{mocks.chat(props);return <div>{props.revisions.length?"Chat evidence fixture":"Chat empty fixture"}</div>;}}));

type Result={data:unknown;error?:{message:string;code:string}|null};
type Read={source:string;selection?:string;filters:[string,unknown][];order?:[string,unknown];limit?:number;search?:string};
let results:Record<string,Result>,reads:Read[],role:string,preview:unknown;
const base="/app/org/projects/project";
const params=()=>Promise.resolve({organisationId:"org",projectId:"project"});
const failure={message:"Supabase internal private credential",code:"XX000"};
const documentRow={id:"document",organisation_id:"org",project_id:"project",document_number:"DOC-001",title:"Load list",document_type:"List",discipline:"Electrical",status:"draft",updated_at:"2026-10-16T09:00:00Z"};
function query(source:string){
  const read:Read={source,filters:[]};reads.push(read);
  const promise=Promise.resolve(results[source]??{data:[]});
  const chain={
    select:(value:string)=>{read.selection=value;return chain;},
    eq:(column:string,value:unknown)=>{read.filters.push([column,value]);return chain;},
    order:(column:string,options?:unknown)=>{read.order=[column,options];return chain;},
    limit:(value:number)=>{read.limit=value;return chain;},
    or:(value:string)=>{read.search=value;return chain;},
    then:promise.then.bind(promise),
  };
  return chain;
}
function allDocuments(filters:{q?:string;organisationId?:string;projectId?:string}={}){return AllDocumentsPage({searchParams:Promise.resolve(filters)});}

beforeEach(()=>{
  vi.clearAllMocks();reads=[];role="document_controller";preview=null;
  results={
    project_access:{data:[{organisation_id:"org",project_id:"project",code:"P-001",name:"Terminal upgrade",role}]},
    get_my_organisations:{data:[{organisation_id:"org",name:"Engineering organisation"}]},
    documents:{data:[documentRow]},
    document_revisions:{data:[{id:"revision",revision_code:"R01",document_id:"document",documents:{document_number:"DOC-001",title:"Load list"}}]},
  };
  mocks.from.mockImplementation(query);mocks.rpc.mockImplementation(query);
  mocks.requireUser.mockResolvedValue({supabase:{from:mocks.from,rpc:mocks.rpc}});
  mocks.requireProject.mockImplementation(async()=>({supabase:{from:mocks.from,rpc:mocks.rpc},access:{role},preview}));
});
afterEach(cleanup);

describe("cross-project documents use each project's existing role",()=>{
  it.each(["document_controller","engineer","viewer"])("preserves the scoped document destination for %s",async projectRole=>{
    Object.assign((results.project_access.data as object[])[0],{role:projectRole});
    render(await allDocuments());
    expect(screen.getByRole("link",{name:"DOC-001"}).getAttribute("href")).toBe(`${base}/documents/document`);
    expect(screen.getByText("Engineering organisation",{selector:"td"})).toBeTruthy();
    expect(screen.getByText("P-001",{selector:"td"})).toBeTruthy();
    expect(reads.find(read=>read.source==="project_access")?.selection).toBe("organisation_id,project_id,code,name,role");
  });
  it.each(["organisation_admin","project_admin","executive_viewer","unknown"])("keeps %s document information without a dead-end operational link",async projectRole=>{
    Object.assign((results.project_access.data as object[])[0],{role:projectRole});
    render(await allDocuments());
    expect(screen.queryByRole("link",{name:"DOC-001"})).toBeNull();
    expect(screen.getByText("DOC-001")).toBeTruthy();expect(screen.getByText("Load list")).toBeTruthy();
  });
  it("does not infer a document destination when its project role is missing",async()=>{
    results.project_access={data:[]};render(await allDocuments());
    expect(screen.getByText("DOC-001")).toBeTruthy();expect(screen.queryByRole("link",{name:"DOC-001"})).toBeNull();
  });
  it("evaluates navigation separately when the user holds different roles across projects",async()=>{
    results.project_access={data:[{organisation_id:"org",project_id:"project",code:"P-001",name:"Managed project",role:"project_admin"},{organisation_id:"org",project_id:"operational-project",code:"P-002",name:"Operational project",role:"document_controller"}]};
    results.documents={data:[documentRow,{...documentRow,id:"second-document",project_id:"operational-project",document_number:"DOC-002"}]};
    render(await allDocuments());
    expect(screen.getByText("DOC-001")).toBeTruthy();expect(screen.queryByRole("link",{name:"DOC-001"})).toBeNull();
    expect(screen.getByRole("link",{name:"DOC-002"}).getAttribute("href")).toBe("/app/org/projects/operational-project/documents/second-document");
  });
  it.each(["project_access","get_my_organisations"])("shows a read-only retry rather than unknown labels when %s fails",async source=>{
    results[source]={data:null,error:failure};render(await allDocuments({q:"EL,(%load)",organisationId:"org",projectId:"project"}));
    expect(screen.getByRole("heading",{name:"Document workspace is temporarily unavailable"})).toBeTruthy();
    expect(screen.getByRole("link",{name:"Retry loading"}).getAttribute("href")).toBe("/app/documents?q=ELload&organisationId=org&projectId=project");
    expect(reads.some(read=>read.source==="documents")).toBe(false);
    expect(screen.queryByRole("table")).toBeNull();expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Supabase|credential|XX000/);
  });
  it("keeps the existing document filters, sanitised search, descending order and 200-row limit",async()=>{
    render(await allDocuments({q:"EL,(%load)",organisationId:"org",projectId:"project"}));
    expect(mocks.requireUser).toHaveBeenCalledTimes(1);
    expect(reads.find(read=>read.source==="documents")).toMatchObject({filters:[["organisation_id","org"],["project_id","project"]],order:["updated_at",{ascending:false}],limit:200,search:"document_number.ilike.%ELload%,title.ilike.%ELload%"});
  });
  it("does not disguise a failed document read as an empty view",async()=>{
    results.documents={data:null,error:failure};render(await allDocuments());
    expect(screen.getByRole("heading",{name:"Documents are temporarily unavailable"})).toBeTruthy();expect(screen.queryByText("No documents match this workspace view.")).toBeNull();
    expect(screen.getByRole("link",{name:"Retry loading"}).getAttribute("href")).toBe("/app/documents");
  });
  it("retains the empty state after a successful empty read",async()=>{
    results.documents={data:[]};render(await allDocuments());
    expect(screen.getByText("No documents match this workspace view.")).toBeTruthy();expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("project search returns to an existing authorised workspace",()=>{
  it.each([["document_controller","documents","Back to document register"],["viewer","documents","Back to document register"],["engineer","assignments","Back to project workspace"],["project_admin","overview","Back to project workspace"],["organisation_admin","overview","Back to project workspace"]])("uses the %s workspace and unchanged search scope",async(nextRole,path,label)=>{
    role=nextRole;render(await SearchPage({params:params()}));
    expect(screen.getByRole("link",{name:label}).getAttribute("href")).toBe(`${base}/${path}`);
    expect(mocks.requireProject).toHaveBeenCalledExactlyOnceWith("org","project");
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith({readOnly:false,endpoint:"/api/v1/organisations/org/projects/project/search",basePath:base});
  });
  it("preserves the audited preview read-only flag",async()=>{
    role="engineer";preview={memberId:"engineer"};render(await SearchPage({params:params()}));
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith({readOnly:true,endpoint:"/api/v1/organisations/org/projects/project/search",basePath:base});
  });
});

describe("project chat keeps its existing AI permission and evidence scope",()=>{
  it.each([["document_controller","documents","Back to document register"],["engineer","assignments","Back to project workspace"]])("returns %s to its valid workspace without changing ready-revision limits",async(nextRole,path,label)=>{
    role=nextRole;render(await ChatPage({params:params()}));
    expect(screen.getByRole("link",{name:label}).getAttribute("href")).toBe(`${base}/${path}`);
    expect(mocks.chat).toHaveBeenCalledExactlyOnceWith({organisationId:"org",projectId:"project",revisions:results.document_revisions.data});
    expect(reads.find(read=>read.source==="document_revisions")).toMatchObject({selection:"id,revision_code,document_id,documents!inner(document_number,title)",filters:[["organisation_id","org"],["project_id","project"],["state","ready"]],order:["created_at",{ascending:false}],limit:100});
  });
  it.each([["organisation_admin","overview","Return to project workspace"],["project_admin","overview","Return to project workspace"],["viewer","documents","Return to documents"]])("does not load AI evidence for %s and provides its valid return path",async(nextRole,path,label)=>{
    role=nextRole;render(await ChatPage({params:params()}));
    expect(screen.getByRole("heading",{name:"AI chat unavailable"})).toBeTruthy();
    expect(screen.getByRole("link",{name:label}).getAttribute("href")).toBe(`${base}/${path}`);
    expect(mocks.from).not.toHaveBeenCalled();expect(mocks.chat).not.toHaveBeenCalled();
  });
  it("does not mount chat or invent an empty evidence scope after a failed read",async()=>{
    results.document_revisions={data:null,error:failure};render(await ChatPage({params:params()}));
    expect(screen.getByRole("heading",{name:"Project evidence is temporarily unavailable"})).toBeTruthy();
    const retry=screen.getByRole("link",{name:"Retry loading"});
    expect(retry.getAttribute("href")).toBe(`${base}/chat`);expect(retry.hasAttribute("data-preview-safe")).toBe(true);
    expect(mocks.chat).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/Supabase|credential|XX000|Chat empty fixture/);
  });
  it("retains a genuinely empty ready-revision scope",async()=>{
    results.document_revisions={data:[]};render(await ChatPage({params:params()}));
    expect(screen.getByText("Chat empty fixture")).toBeTruthy();expect(screen.queryByRole("alert")).toBeNull();
  });
});
