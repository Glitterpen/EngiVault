// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn(),from:vi.fn(),select:vi.fn(),eq:vi.fn(),single:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:mocks.getUser},rpc:mocks.rpc,from:mocks.from})}));
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw new Error(`REDIRECT:${path}`);}}));
vi.mock("./actions",()=>({switchInvitationAccount:vi.fn()}));
import InvitePage from "./page";
const org="ef100000-0000-4000-8000-000000000001",project="ef200000-0000-4000-8000-000000000001";
beforeEach(()=>{
  vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:"invited-user",email:"invited@example.test"}}});
  mocks.rpc.mockResolvedValue({data:{kind:"executive",organisation_id:org},error:null});
  mocks.from.mockReturnValue({select:mocks.select});mocks.select.mockReturnValue({eq:mocks.eq});mocks.eq.mockReturnValue({maybeSingle:mocks.single});
});
describe("workspace invitation routing",()=>{
  it("sends accepted executives to the summary-only dashboard",async()=>{
    await expect(InvitePage({params:Promise.resolve({token:"test-token"})})).rejects.toThrow(`REDIRECT:/app/${org}/executive`);
    expect(mocks.rpc).toHaveBeenCalledWith("accept_workspace_invitation",{raw_token:"test-token"});
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("retains the existing engineer assignment landing route",async()=>{
    mocks.rpc.mockResolvedValue({data:{kind:"project",project_id:project},error:null});
    mocks.single.mockResolvedValue({data:{organisation_id:org,project_id:project,role:"engineer"}});
    await expect(InvitePage({params:Promise.resolve({token:"test-token"})})).rejects.toThrow(`REDIRECT:/app/${org}/projects/${project}/assignments`);
  });
  it("requires login before attempting invitation acceptance",async()=>{
    mocks.getUser.mockResolvedValue({data:{user:null}});
    await expect(InvitePage({params:Promise.resolve({token:"test-token"})})).rejects.toThrow("REDIRECT:/login?next=%2Finvite%2Ftest-token");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("fails closed on malformed acceptance data",async()=>{
    mocks.rpc.mockResolvedValue({data:{kind:"executive",organisation_id:"invalid"},error:null});
    await expect(InvitePage({params:Promise.resolve({token:"test-token"})})).rejects.toThrow("Invitation access could not be verified");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
