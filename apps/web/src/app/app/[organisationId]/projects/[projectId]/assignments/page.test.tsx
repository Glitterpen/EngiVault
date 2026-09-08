import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import AssignmentsPage from "./page";
import {requireProject} from "@/lib/auth";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("Multi-discipline engineer dashboard",()=>{
  it("shows assigned deliverables across all PM scopes without exposing unrelated documents",async()=>{
    const document=(id:string,discipline:string)=>({id,discipline,document_number:id,title:`${id} deliverable`,document_type:"Report",progress_weight:1,planned_submission_date:null,planned_final_date:null,required_issue_status:"Issued for Review (IFR)"});
    const rows:Record<string,unknown[]>={
      project_member_disciplines:[{discipline:"Electrical"},{discipline:"Instrumentation"}],
      document_assignments:[{document_id:"ELE-01"},{document_id:"INS-01"},{document_id:"MECH-01"}],
      documents:[document("ELE-01","Electrical"),document("INS-01","Instrumentation"),document("MECH-01","Mechanical"),document("ELE-02","Electrical")],
      document_revisions:[],notifications:[],
      project_document_progress:["ELE-01","INS-01"].map(document_id=>({document_id,planned_submission_date:null,next_submission_date:null,last_issue_date:null,revision_cycle_days:3,deadline_kind:"first_issue",overdue:false})),
    };
    const from=vi.fn((table:string)=>{
      const result={data:table==="projects"?{name:"Multi-discipline project",code:"MULTI",delivery_stage:"feed",key_objectives:[]}:rows[table]??[]};
      const query:Record<string,unknown>={then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};
      for(const method of ["select","eq","in","order","limit","maybeSingle"])query[method]=vi.fn(()=>query);
      return query;
    });
    vi.mocked(requireProject).mockResolvedValue({access:{role:"engineer"},user:{id:"engineer"},supabase:{from,rpc:vi.fn().mockResolvedValue({data:null})}} as never);
    render(await AssignmentsPage({params:Promise.resolve({organisationId:"org",projectId:"project"}),searchParams:Promise.resolve({})}));
    expect(screen.getByRole("heading",{name:"ELE-01 deliverable",level:2})).toBeTruthy();
    expect(screen.getByRole("heading",{name:"INS-01 deliverable",level:2})).toBeTruthy();
    expect(screen.queryByText("MECH-01 deliverable")).toBeNull();
    expect(screen.queryByText("ELE-02 deliverable")).toBeNull();
    expect(screen.getAllByText("Electrical").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Instrumentation").length).toBeGreaterThan(0);
  });
});
