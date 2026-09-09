// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {inviteExecutive,revokeExecutive} from "./executive-actions";
import {requireExecutiveAdministrator} from "@/lib/executive-admin";
import {sendInvitationEmail} from "@/lib/invitation-email";
import {revalidatePath} from "next/cache";
vi.mock("@/lib/executive-admin",()=>({requireExecutiveAdministrator:vi.fn()}));
vi.mock("@/lib/invitation-token",()=>({createInvitationToken:vi.fn(async()=>({raw:"a".repeat(64),tokenHash:"b".repeat(64),expiresAt:"2026-09-16T12:00:00Z"}))}));
vi.mock("@/lib/invitation-email",()=>({sendInvitationEmail:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
const org="ef100000-0000-4000-8000-000000000001";
const rpc=vi.fn();
function form(extra:Record<string,string>={}){const data=new FormData();for(const [key,value] of Object.entries({organisationId:org,email:"Director@Example.test",...extra}))data.set(key,value);return data;}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("NEXT_PUBLIC_APP_URL","https://example.test");rpc.mockResolvedValue({data:"id",error:null});vi.mocked(requireExecutiveAdministrator).mockResolvedValue({supabase:{rpc},organisation:{name:"Trusted Organisation"}} as never);vi.mocked(sendInvitationEmail).mockResolvedValue({sent:true});});
afterEach(()=>vi.unstubAllEnvs());
describe("controlled executive access actions",()=>{
  it("emails only after authorised creation, with a hashed database token and trusted branding",async()=>{
    const result=await inviteExecutive(undefined,form());
    expect(requireExecutiveAdministrator).toHaveBeenCalledWith(org);
    expect(rpc).toHaveBeenCalledWith("create_executive_invitation",expect.objectContaining({target_organisation:org,target_email:"director@example.test",target_token_hash:"b".repeat(64)}));
    expect(sendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({organisationName:"Trusted Organisation",role:"executive_viewer"}));
    expect(result?.ok).toBe(true);expect(result?.acceptUrl).toBeUndefined();
  });
  it("does not send invitations when administrator verification fails",async()=>{
    vi.mocked(requireExecutiveAdministrator).mockRejectedValue(new Error("not found"));
    await expect(inviteExecutive(undefined,form())).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();expect(sendInvitationEmail).not.toHaveBeenCalled();
  });
  it("returns a one-time fallback only to the authorised administrator when email fails",async()=>{
    vi.mocked(sendInvitationEmail).mockRejectedValue(new Error("offline"));
    const result=await inviteExecutive(undefined,form());
    expect(result?.ok).toBe(true);expect(result?.acceptUrl).toBe(`https://example.test/invite/${"a".repeat(64)}`);
  });
  it("does not reveal internal failures or send email on database rejection",async()=>{
    rpc.mockResolvedValue({error:{code:"XX000",message:"private internal detail"}});
    const result=await inviteExecutive(undefined,form());
    expect(result?.message).not.toContain("private internal detail");expect(result?.acceptUrl).toBeUndefined();expect(sendInvitationEmail).not.toHaveBeenCalled();
  });
  it("requires explicit revocation confirmation",async()=>{
    expect((await revokeExecutive(undefined,form({id:org,kind:"member"})))?.ok).not.toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect((await revokeExecutive(undefined,form({id:org,kind:"member",confirmed:"true"})))?.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("revoke_executive_access",{target_organisation:org,target_id:org,target_kind:"member"});
    expect(revalidatePath).toHaveBeenCalledWith(`/app/${org}`,"layout");
  });
});
