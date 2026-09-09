// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({requireUser:vi.fn(),preview:vi.fn(),rpc:vi.fn(),eq:vi.fn(),single:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./auth",()=>({requireUser:mocks.requireUser}));
vi.mock("./admin-preview",()=>({readAdminPreview:mocks.preview}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("NOT_FOUND");}}));
import {requireExecutiveAdministrator} from "./executive-admin";
const org="ef100000-0000-4000-8000-000000000001";
beforeEach(()=>{
  vi.clearAllMocks();mocks.preview.mockResolvedValue(null);
  mocks.requireUser.mockResolvedValue({supabase:{rpc:mocks.rpc},user:{id:"admin"}});
  mocks.rpc.mockReturnValue({eq:mocks.eq});mocks.eq.mockReturnValue({maybeSingle:mocks.single});
  mocks.single.mockResolvedValue({data:{organisation_id:org,name:"Trusted name",role:"organisation_admin"},error:null});
});
describe("private executive administrator boundary",()=>{
  it("scopes a verified administrator to the requested organisation",async()=>{
    expect((await requireExecutiveAdministrator(org)).organisation.name).toBe("Trusted name");
    expect(mocks.eq).toHaveBeenCalledWith("organisation_id",org);
  });
  it.each(["project_admin","document_controller","engineer","executive_viewer","member"])("denies %s",async(role)=>{
    mocks.single.mockResolvedValue({data:{organisation_id:org,name:"Company",role},error:null});
    await expect(requireExecutiveAdministrator(org)).rejects.toThrow("NOT_FOUND");
  });
  it("blocks administrator actions during audited member preview",async()=>{
    mocks.preview.mockResolvedValue({memberId:"member"});
    await expect(requireExecutiveAdministrator(org)).rejects.toThrow("NOT_FOUND");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("fails closed when membership cannot be verified",async()=>{
    mocks.single.mockResolvedValue({data:null,error:{code:"42501"}});
    await expect(requireExecutiveAdministrator(org)).rejects.toThrow("NOT_FOUND");
  });
});
