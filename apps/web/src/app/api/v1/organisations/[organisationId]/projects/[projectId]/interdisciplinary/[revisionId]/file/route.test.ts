// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {GET} from "./route";
import {requireProject} from "@/lib/auth";
import {createAdminClient} from "@/lib/supabase/admin";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:vi.fn()}));
const params={organisationId:"a0000000-0000-4000-8000-000000000001",projectId:"b0000000-0000-4000-8000-000000000001",revisionId:"c0000000-0000-4000-8000-000000000001"};
const single=vi.fn(),rpc=vi.fn<(name:string,args:Record<string,unknown>)=>{single:typeof single}>(()=>({single})),sign=vi.fn(),from=vi.fn(()=>({createSignedUrl:sign}));
const get=(suffix="",scope=params)=>GET(new Request(`https://app.example.test/file${suffix}`),{params:Promise.resolve(scope)});
beforeEach(()=>{vi.clearAllMocks();vi.mocked(requireProject).mockResolvedValue({supabase:{rpc}} as never);vi.mocked(createAdminClient).mockReturnValue({storage:{from}} as never);single.mockResolvedValue({data:{storage_key:"authorised/revision.pdf",original_filename:"approved.pdf"},error:null});sign.mockResolvedValue({data:{signedUrl:"https://files.example.test/approved?token=test-only"},error:null});});
it("authorises the exact tenant/project/revision before signing for 60 seconds",async()=>{const result=await get();expect(result.status).toBe(302);expect(rpc).toHaveBeenCalledWith("authorize_interdisciplinary_file",{target_organisation:params.organisationId,target_project:params.projectId,target_revision:params.revisionId,native_file:false});expect(from).toHaveBeenCalledWith("documents");expect(sign).toHaveBeenCalledWith("authorised/revision.pdf",60,undefined);expect(result.headers.get("cache-control")).toContain("no-store");expect(result.headers.get("referrer-policy")).toBe("no-referrer");});
it("uses only database-returned paths and names, including native downloads",async()=>{await get("?native=1&download=1&storage_key=foreign/file&filename=evil.pdf&target_preview=forged");expect(rpc).toHaveBeenCalledWith("authorize_interdisciplinary_file",expect.objectContaining({native_file:true}));expect(rpc.mock.calls[0][1]).not.toHaveProperty("target_preview");expect(sign).toHaveBeenCalledWith("authorised/revision.pdf",60,{download:"approved.pdf"});});
it.each([{data:null,error:null},{data:{storage_key:"private"},error:{code:"42501"}}])("never creates an admin signer for denied files",async response=>{single.mockResolvedValue(response);expect((await get()).status).toBe(403);expect(createAdminClient).not.toHaveBeenCalled();});
it("rejects invalid IDs before authentication or signing",async()=>{expect((await get("",{...params,revisionId:"invalid"})).status).toBe(400);expect(requireProject).not.toHaveBeenCalled();expect(createAdminClient).not.toHaveBeenCalled();});
it("reports a safe storage failure",async()=>{sign.mockResolvedValue({data:null,error:{message:"private details"}});const response=await get();expect(response.status).toBe(503);expect(await response.text()).not.toContain("private details");});
