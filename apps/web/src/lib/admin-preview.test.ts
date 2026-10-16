// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({value:undefined as string|undefined,rpc:vi.fn(),createClient:vi.fn(),redirect:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("react",()=>({cache:<T>(fn:T)=>fn}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>mocks.value?{value:mocks.value}:undefined})}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.createClient}));
import {readAdminPreview} from "./admin-preview";

const organisationId="fdd57c46-9041-4b30-9a09-82d353175251";
const projectId="6ffa3130-1a47-4c97-94e2-7044452efb6f";
const sessionId="dd572493-d0b2-4ea2-84d3-529b5db99285";
const preview={organisationId,projectId,sessionId,memberId:"member",role:"engineer",displayName:"Engineer",email:"engineer@example.test",disciplines:["Electrical"],expiresAt:"2026-10-16T22:00:00Z"};
const redirectSignal=Object.assign(new Error("NEXT_REDIRECT"),{digest:"NEXT_REDIRECT;replace;/admin-preview-unavailable;307;"});
beforeEach(()=>{
  vi.clearAllMocks();mocks.value=`${organisationId}:${projectId}:${sessionId}`;
  mocks.createClient.mockResolvedValue({rpc:mocks.rpc});
  mocks.rpc.mockResolvedValue({data:preview,error:null});
  mocks.redirect.mockImplementation(()=>{throw redirectSignal});
});

describe("audited preview availability",()=>{
  it("returns no preview only when no preview cookie exists",async()=>{
    mocks.value=undefined;expect(await readAdminPreview()).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("keeps a valid preview and the exact audited session lookup unchanged",async()=>{
    expect(await readAdminPreview()).toEqual(preview);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_project_member_preview",{target_preview:sessionId});
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("redirects a malformed cookie without using the actor's data",async()=>{
    mocks.value="invalid";await expect(readAdminPreview()).rejects.toBe(redirectSignal);
    expect(mocks.createClient).not.toHaveBeenCalled();expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/admin-preview-unavailable");
  });
  it.each([
    {data:null,error:{code:"42501"}},
    {data:null,error:null},
    {data:{...preview,organisationId:"another-organisation"},error:null},
    {data:{...preview,projectId:"another-project"},error:null},
  ])("redirects expired, ended, denied or mismatched previews instead of a render error",async(result)=>{
    mocks.rpc.mockResolvedValue(result);
    await expect(readAdminPreview()).rejects.toBe(redirectSignal);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/admin-preview-unavailable");
  });
  it("fails closed on a preview service failure without swallowing framework redirect",async()=>{
    mocks.rpc.mockRejectedValue(new Error("private service diagnostic"));
    await expect(readAdminPreview()).rejects.toBe(redirectSignal);
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/admin-preview-unavailable");
  });
});
