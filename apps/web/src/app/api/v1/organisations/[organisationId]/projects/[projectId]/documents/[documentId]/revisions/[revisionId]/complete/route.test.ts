// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {POST} from "./route";
import {requireProject} from "@/lib/auth";
import {after} from "next/server";
import {TRANSMITTED_OVERRIDE_WARNING} from "@/lib/submission-override";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("next/server",()=>({after:vi.fn()}));
vi.mock("@/lib/processor",()=>({processNextDocumentRevision:vi.fn()}));
const rpc=vi.fn(),single=vi.fn();
const query={select:vi.fn(),eq:vi.fn(),maybeSingle:single};
const params={organisationId:"org",projectId:"project",documentId:"doc",revisionId:"revision"};
beforeEach(()=>{vi.clearAllMocks();query.select.mockReturnValue(query);query.eq.mockReturnValue(query);single.mockResolvedValue({data:{id:"revision"}});vi.mocked(requireProject).mockResolvedValue({supabase:{rpc,from:()=>query},access:{role:"engineer"}} as never);rpc.mockResolvedValue({data:true,error:null});});
const post=()=>POST(new Request("https://app.example.test/complete",{method:"POST"}),{params:Promise.resolve(params)});
it("reports transmission during upload without starting a processor",async()=>{rpc.mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({error:{code:"55000",message:"override_already_transmitted"}});const response=await post();expect(response.status).toBe(409);expect((await response.json()).error.message).toBe(TRANSMITTED_OVERRIDE_WARNING);expect(after).not.toHaveBeenCalled();});
it("queues processing only after completion succeeds",async()=>{expect((await post()).status).toBe(200);expect(after).toHaveBeenCalledOnce();});
it("retains native-upload error guidance",async()=>{rpc.mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({error:{code:"23514",message:"native source not found"}});const response=await post();expect(response.status).toBe(409);expect((await response.json()).error.message).toContain("editable native source");expect(after).not.toHaveBeenCalled();});
it("reports missing DCC acceptance in a resumed issue chain without native-file misinformation or background processing",async()=>{rpc.mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({error:{code:"23514",message:"issue sequence prerequisite missing: DCC acceptance is required for the earlier stage"}});const response=await post();expect(response.status).toBe(409);const body=await response.json();expect(body.error.code).toBe("ISSUE_SEQUENCE_REQUIRED");expect(body.error.message).toContain("DCC must accept IFR before IFA is submitted");expect(body.error.message).toContain("accept IFA before IFD or IFC is submitted");expect(body.error.message).not.toContain("editable native source");expect(after).not.toHaveBeenCalled();});
