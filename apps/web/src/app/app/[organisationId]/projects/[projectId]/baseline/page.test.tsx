import {beforeEach,describe,expect,it,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import Page from "./page";
import {requireProject} from "@/lib/auth";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/components/project-milestone-baseline-editor",()=>({ProjectMilestoneBaselineEditor:({editor}:{editor:{documents:unknown[]}})=><div data-editor-count={editor.documents.length}>Milestone editor</div>}));
const rpc=vi.fn();
const params=Promise.resolve({organisationId:"org",projectId:"project"});
const editor={scope_hash:"scope",current_baseline_id:null,baseline_version:null,planned_start_date:"2026-10-01",planned_end_date:"2026-11-01",delivery_stage:"feed",revision_cycle_days:3,documents:[]};
function access(role="project_admin",preview=false){vi.mocked(requireProject).mockResolvedValue({access:{role},supabase:{rpc},preview:preview?{}:null} as never);}
beforeEach(()=>{vi.clearAllMocks();access();rpc.mockResolvedValue({data:editor,error:null});});
describe("milestone baseline page",()=>{
  it("reads a complete PM editor through the scoped RPC without approving on read",async()=>{const html=renderToStaticMarkup(await Page({params}));expect(html).toContain("Milestone editor");expect(rpc).toHaveBeenCalledExactlyOnceWith("get_project_milestone_baseline_editor",{target_organisation:"org",target_project:"project"});expect(html).toContain("Back to progress");});
  it.each(["organisation_admin","document_controller","engineer","viewer"])("does not expose the editor to %s",async role=>{access(role);const html=renderToStaticMarkup(await Page({params}));expect(html).toContain("Only the appointed Project Manager");expect(html).not.toContain("Milestone editor");expect(rpc).not.toHaveBeenCalled();});
  it("does not start background reads or writes in audited PM preview",async()=>{access("project_admin",true);const html=renderToStaticMarkup(await Page({params}));expect(html).toContain("previews are read-only");expect(rpc).not.toHaveBeenCalled();});
  it("distinguishes unavailable database support from an empty project",async()=>{rpc.mockResolvedValue({data:null,error:{code:"PGRST202",message:"supabase function absent"}});const html=renderToStaticMarkup(await Page({params}));expect(html).toContain("Milestone plan unavailable");expect(html).toContain("Reference: EC-");expect(html).not.toContain("supabase");expect(html).not.toContain("Milestone editor");});
  it("fails closed for a malformed or partial scope response",async()=>{rpc.mockResolvedValue({data:{...editor,documents:[{}]},error:null});const html=renderToStaticMarkup(await Page({params}));expect(html).toContain("complete milestone plan could not be verified");expect(html).not.toContain("Milestone editor");});
  it("explains the complete-scope capacity limit without showing a partial baseline",async()=>{rpc.mockResolvedValue({data:null,error:{code:"54000"}});const html=renderToStaticMarkup(await Page({params}));expect(html).toContain("1,000 active deliverables");expect(html).toContain("No partial plan");expect(html).not.toContain("Milestone editor");});
  it("shows a safe retry state on transport failure",async()=>{rpc.mockRejectedValue(new Error("private backend details"));const html=renderToStaticMarkup(await Page({params}));expect(html).toContain("temporarily unavailable");expect(html).not.toContain("private backend");});
});
