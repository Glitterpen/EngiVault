import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import DocumentsPage from "./page";
import {requireProject} from "@/lib/auth";
import {loadDisciplineAssignmentScopes} from "@/lib/load-discipline-assignment-scopes";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/lib/load-discipline-assignment-scopes",()=>({loadDisciplineAssignmentScopes:vi.fn()}));
vi.mock("@/components/document-create-dialog",()=>({DocumentCreateDialog:()=>null}));
vi.mock("@/components/mdr-import-dialog",()=>({MdrImportDialog:()=>null}));
vi.mock("@/components/mdr-document-actions",()=>({MdrDocumentActions:()=>null}));
vi.mock("@/app/app/workflow-actions",()=>({assignDisciplineDocuments:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn()}));
afterEach(cleanup);
const engineer={userId:"engineer",name:"Engineer",email:"engineer@example.test",disciplines:["Electrical"]};
let role="document_controller",teamError:unknown=null;
beforeEach(()=>{
  vi.clearAllMocks();role="document_controller";teamError=null;
  const from=vi.fn(()=>{
    const query:Record<string,unknown>={then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:[],count:0,error:null}).then(resolve)};
    for(const method of ["select","eq","order","range","limit"])query[method]=vi.fn(()=>query);
    return query;
  });
  const rpc=vi.fn(async(name:string)=>name==="get_project_team"?{data:[{user_id:engineer.userId,display_name:engineer.name,email:engineer.email,role:"engineer",disciplines:engineer.disciplines},{user_id:"pm",display_name:"Manager",role:"project_admin",disciplines:[]}],error:teamError}:{data:name==="can_register_documents"?true:[],error:null});
  vi.mocked(requireProject).mockImplementation(async()=>({access:{role},supabase:{from,rpc}} as never));
  vi.mocked(loadDisciplineAssignmentScopes).mockResolvedValue({available:true,scopes:[{name:"Electrical",documentCount:2,engineers:[{...engineer,assignedCount:2,remainingCount:0}]}]});
});
const page=(records?:string)=>DocumentsPage({params:Promise.resolve({organisationId:"org",projectId:"project"}),searchParams:Promise.resolve({records})});
it("uses live assignment status instead of MDR metadata to populate the form",async()=>{
  render(await page());
  expect(loadDisciplineAssignmentScopes).toHaveBeenCalledWith(expect.anything(),"org","project",[engineer]);
  expect(screen.getByText("View assigned allocations (1)")).toBeTruthy();
  expect(screen.queryByRole("combobox",{name:"MDR discipline"})).toBeNull();
});
it("does not show an assignment form if assignment status cannot be loaded",async()=>{
  vi.mocked(loadDisciplineAssignmentScopes).mockResolvedValue({available:false,scopes:[]});
  render(await page());
  expect(screen.getByRole("alert").textContent).toContain("Assignment status could not be loaded");
  expect(screen.queryByText("Assign deliverables by discipline")).toBeNull();
});
it("does not treat a failed team read as no eligible engineers",async()=>{
  teamError={code:"OFFLINE"};render(await page());
  expect(loadDisciplineAssignmentScopes).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toBeTruthy();
});
it("keeps archived deliverables out of the assignment workflow",async()=>{
  render(await page("removed"));
  expect(loadDisciplineAssignmentScopes).not.toHaveBeenCalled();
  expect(screen.queryByText("Assign deliverables by discipline")).toBeNull();
});
it("does not load assignment controls for a viewer",async()=>{
  role="viewer";render(await page());
  expect(loadDisciplineAssignmentScopes).not.toHaveBeenCalled();
  expect(screen.queryByText("Assign deliverables by discipline")).toBeNull();
});
