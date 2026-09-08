// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {processQueuedIdentityPurges} from "./identity-purge";

const id="81000000-0000-4000-8000-000000000001";
const rpc=vi.fn(),deleteUser=vi.fn(),updateUserById=vi.fn(),lookup=vi.fn();
const client={rpc,from:vi.fn(()=>({select:vi.fn(()=>({in:lookup}))})),auth:{admin:{deleteUser,updateUserById}}};
beforeEach(()=>{
  vi.clearAllMocks();
  rpc.mockImplementation((name:string)=>Promise.resolve({data:name==="claim_user_identity_purges"?[{user_id:id}]:null,error:null}));
  lookup.mockResolvedValue({data:[{user_id:id}],error:null});
  deleteUser.mockResolvedValue({error:null});updateUserById.mockResolvedValue({error:null});
});
it("irreversibly deletes the login while preserving its historical UUID",async()=>{
  expect(await processQueuedIdentityPurges(client as never,[id])).toEqual({claimed:1,completed:1,failed:0});
  expect(deleteUser).toHaveBeenCalledWith(id,true);expect(updateUserById).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenLastCalledWith("finish_user_identity_purge",{target_user:id,succeeded:true,failure_code:null});
});
it("keeps existing organisation-deletion anonymisation behaviour",async()=>{
  lookup.mockResolvedValue({data:[],error:null});
  await processQueuedIdentityPurges(client as never,[id]);
  expect(deleteUser).not.toHaveBeenCalled();expect(updateUserById).toHaveBeenCalledOnce();
});
it("does not guess the deletion mode when its protected lookup fails",async()=>{
  lookup.mockResolvedValue({data:null,error:{code:"unavailable"}});
  await expect(processQueuedIdentityPurges(client as never,[id])).rejects.toThrow("retirement status");
  expect(deleteUser).not.toHaveBeenCalled();expect(updateUserById).not.toHaveBeenCalled();
});
it("records identity-service failure for retry without claiming completion",async()=>{
  deleteUser.mockRejectedValue(new Error("offline"));
  expect(await processQueuedIdentityPurges(client as never,[id])).toEqual({claimed:1,completed:0,failed:1});
  expect(rpc).toHaveBeenLastCalledWith("finish_user_identity_purge",{target_user:id,succeeded:false,failure_code:"IDENTITY_SERVICE_UNAVAILABLE"});
});
it("handles already removed auth identities idempotently",async()=>{
  deleteUser.mockResolvedValue({error:{code:"user_not_found"}});
  expect((await processQueuedIdentityPurges(client as never,[id])).completed).toBe(1);
});
it("does not report completion until queue acknowledgement succeeds",async()=>{
  rpc.mockImplementation((name:string)=>Promise.resolve(name==="claim_user_identity_purges"?{data:[{user_id:id}],error:null}:{error:{code:"offline"}}));
  expect((await processQueuedIdentityPurges(client as never,[id])).completed).toBe(0);
});
