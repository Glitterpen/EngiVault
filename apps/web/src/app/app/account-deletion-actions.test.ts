// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {deleteRemovedMemberAccount} from "./account-deletion-actions";
import {requireUser} from "@/lib/auth";
import {cookies} from "next/headers";
import {processQueuedIdentityPurges} from "@/lib/identity-purge";
import {createAdminClient} from "@/lib/supabase/admin";
vi.mock("@/lib/auth",()=>({requireUser:vi.fn()}));
vi.mock("@/lib/admin-preview",()=>({ADMIN_PREVIEW_COOKIE:"engicite_admin_preview"}));
vi.mock("@/lib/identity-purge",()=>({processQueuedIdentityPurges:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:vi.fn()}));
vi.mock("next/headers",()=>({cookies:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
const org="82000000-0000-4000-8000-000000000001",userId="81000000-0000-4000-8000-000000000002";
const rpc=vi.fn(),membership=vi.fn();
function form(){const value=new FormData();Object.entries({organisationId:org,userId,confirmationEmail:"engineer@example.test",acknowledge:"yes"}).forEach(([key,item])=>value.set(key,item));return value;}
beforeEach(()=>{
  vi.clearAllMocks();
  vi.mocked(cookies).mockResolvedValue({has:()=>false} as never);
  vi.mocked(requireUser).mockResolvedValue({user:{id:"81000000-0000-4000-8000-000000000001"},supabase:{rpc}} as never);
  const chain={eq:vi.fn().mockReturnThis(),maybeSingle:membership};
  membership.mockResolvedValue({data:{role:"organisation_admin"},error:null});
  rpc.mockImplementation((name:string)=>name==="get_my_organisations"?chain:Promise.resolve({error:null}));
  vi.mocked(createAdminClient).mockReturnValue({} as never);
  vi.mocked(processQueuedIdentityPurges).mockResolvedValue({claimed:1,completed:1,failed:0});
});
it("requires explicit confirmation",async()=>{const value=form();value.delete("acknowledge");expect((await deleteRemovedMemberAccount(undefined,value))?.ok).toBe(false);expect(rpc).not.toHaveBeenCalled();});
it("blocks read-only previews before any mutation",async()=>{vi.mocked(cookies).mockResolvedValue({has:()=>true} as never);expect((await deleteRemovedMemberAccount(undefined,form()))?.message).toContain("read-only");expect(rpc).not.toHaveBeenCalled();});
it("rechecks administrator authority",async()=>{membership.mockResolvedValue({data:null,error:null});expect((await deleteRemovedMemberAccount(undefined,form()))?.ok).toBe(false);expect(processQueuedIdentityPurges).not.toHaveBeenCalled();});
it("cannot delete self",async()=>{vi.mocked(requireUser).mockResolvedValue({user:{id:userId},supabase:{rpc}} as never);expect((await deleteRemovedMemberAccount(undefined,form()))?.ok).toBe(false);expect(rpc).not.toHaveBeenCalled();});
it("does not retire access when the identity service is unconfigured",async()=>{vi.mocked(createAdminClient).mockImplementationOnce(()=>{throw new Error("missing")});expect((await deleteRemovedMemberAccount(undefined,form()))?.ok).toBe(false);expect(rpc).toHaveBeenCalledTimes(1);});
it("does not call the privileged deletion service after database rejection",async()=>{rpc.mockImplementationOnce(()=>({eq:vi.fn().mockReturnThis(),maybeSingle:membership})).mockResolvedValueOnce({error:{code:"42501",message:"Supabase internal"}});const result=await deleteRemovedMemberAccount(undefined,form());expect(result?.ok).toBe(false);expect(result?.message).not.toContain("Supabase");expect(processQueuedIdentityPurges).not.toHaveBeenCalled();});
it("requests scoped retirement before deleting only the authorised UUID",async()=>{expect((await deleteRemovedMemberAccount(undefined,form()))?.message).toContain("Account deleted");expect(rpc).toHaveBeenLastCalledWith("request_removed_member_account_deletion",{target_organisation:org,target_user:userId,confirmation_email:"engineer@example.test"});expect(processQueuedIdentityPurges).toHaveBeenCalledWith({},[userId]);});
it("reports queued rather than completed on service failure",async()=>{vi.mocked(processQueuedIdentityPurges).mockRejectedValueOnce(new Error("offline"));expect((await deleteRemovedMemberAccount(undefined,form()))?.message).toContain("queued for retry");});
