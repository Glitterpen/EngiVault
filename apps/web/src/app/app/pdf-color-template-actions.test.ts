// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from "vitest";
import {generateProjectReport,saveProjectReportSchedule} from "./project-report-actions";
import {createDocumentTransmittal} from "./actions";
import {requireProject} from "@/lib/auth";
import {revalidatePath} from "next/cache";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),redirect:vi.fn((path:string)=>{throw new Error(`REDIRECT:${path}`);})}));
vi.mock("@/lib/auth",()=>({requireProject:vi.fn(),requireUser:vi.fn(),requireAuthenticatedUser:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:vi.fn()}));
vi.mock("@/lib/identity-purge",()=>({processQueuedIdentityPurges:vi.fn()}));
const organisationId="a0000000-0000-4000-8000-000000000001",projectId="a1000000-0000-4000-8000-000000000001",revisionId="a2000000-0000-4000-8000-000000000001",resultId="a3000000-0000-4000-8000-000000000001";
function access(role="project_admin",preview=false){vi.mocked(requireProject).mockResolvedValue({access:{role},preview:preview?{}:null,supabase:{rpc:mocks.rpc,from:mocks.from}} as never);}
function form(template?:string){const data=new FormData();Object.entries({organisationId,projectId,weekday:"5",enabled:"on",transmittalNumber:"TR-001",recipientContact:"",recipientEmail:"",message:""}).forEach(([key,value])=>data.set(key,value));data.append("revisionIds",revisionId);if(template!==undefined)data.set("pdfColorTemplate",template);return data;}
beforeEach(()=>{
  vi.clearAllMocks();access();mocks.rpc.mockResolvedValue({data:resultId,error:null});
  const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:{client_name:"Controlled client"},error:null})};mocks.from.mockReturnValue(query);
});

describe("scoped PDF template actions",()=>{
  it("passes the selected scheduled template to the permission-checked wrapper",async()=>{
    expect((await saveProjectReportSchedule(undefined,form("forest")))?.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("set_project_report_schedule_with_pdf_template",{target_organisation:organisationId,target_project:projectId,new_weekday:5,new_enabled:true,new_pdf_color_template:"forest"});
    expect(revalidatePath).toHaveBeenCalledWith(`/app/${organisationId}/projects/${projectId}/reports`);
  });
  it("passes a manual selection without changing the report-generation workflow",async()=>{
    expect((await generateProjectReport(undefined,form("slate")))?.reportId).toBe(resultId);
    expect(mocks.rpc).toHaveBeenCalledWith("generate_project_weekly_report_with_pdf_template",expect.objectContaining({target_organisation:organisationId,target_project:projectId,new_pdf_color_template:"slate",target_period_end:expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)}));
  });
  it.each([saveProjectReportSchedule,generateProjectReport])("uses neutral when an older form omits the template",async action=>{
    await action(undefined,form());expect(mocks.rpc).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({new_pdf_color_template:"neutral"}));
  });
  it.each([saveProjectReportSchedule,generateProjectReport,createDocumentTransmittal])("rejects an unsupported template before reading or writing the project",async action=>{
    expect((await action(undefined,form("custom")))?.message).toBeTruthy();expect(requireProject).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["engineer","document_controller","organisation_admin","viewer"])("does not grant report generation to %s",async role=>{
    access(role);await generateProjectReport(undefined,form("forest"));await saveProjectReportSchedule(undefined,form("forest"));expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("creates a DCC transmittal with its frozen template and controlled client",async()=>{
    access("document_controller");await expect(createDocumentTransmittal(undefined,form("burgundy"))).rejects.toThrow(`REDIRECT:/app/${organisationId}/projects/${projectId}/work-packages/${resultId}`);
    expect(mocks.rpc).toHaveBeenCalledWith("create_document_transmittal_with_pdf_template",{target_organisation:organisationId,target_project:projectId,new_number:"TR-001",recipient_company:"Controlled client",recipient_contact:"",recipient_email:"",new_purpose:"Client document transmittal",new_message:"",selected_revision_ids:[revisionId],new_pdf_color_template:"burgundy"});
  });
  it("does not grant DCC issuance to project management",async()=>{
    await createDocumentTransmittal(undefined,form("slate"));expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.from).not.toHaveBeenCalled();
  });
  it("keeps audited previews read-only for all new wrappers",async()=>{
    access("project_admin",true);expect((await generateProjectReport(undefined,form("slate")))?.message).toContain("read-only");expect((await saveProjectReportSchedule(undefined,form("slate")))?.message).toContain("read-only");
    access("document_controller",true);expect((await createDocumentTransmittal(undefined,form("slate")))?.message).toContain("read-only");expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("never reports success or revalidates on persistence failure",async()=>{
    mocks.rpc.mockResolvedValue({error:{code:"42501"},data:null});expect((await generateProjectReport(undefined,form("slate")))?.ok).not.toBe(true);expect((await saveProjectReportSchedule(undefined,form("slate")))?.ok).not.toBe(true);expect(revalidatePath).not.toHaveBeenCalled();
  });
});
