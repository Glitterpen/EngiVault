import {beforeEach,expect,it,vi} from "vitest";
import AppLayout from "./layout";

const mocks=vi.hoisted(()=>({read:vi.fn(),from:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireUser:async()=>({supabase:{from:mocks.from,rpc:mocks.rpc},user:{id:"administrator"}})}));
vi.mock("@/lib/admin-preview",()=>({readAdminPreview:mocks.read}));
vi.mock("@/lib/member-preview-client",()=>({createMemberPreviewClient:vi.fn()}));
vi.mock("@/components/brand",()=>({Brand:()=>null}));
vi.mock("@/components/workspace-navigation",()=>({WorkspaceNavigation:()=>null}));
vi.mock("@/components/admin-preview-boundary",()=>({AdminPreviewBoundary:()=>null}));
vi.mock("@/components/account-menu",()=>({AccountMenu:()=>null}));
beforeEach(()=>vi.clearAllMocks());

it("lets an unavailable preview redirect propagate before reading administrator workspace data",async()=>{
  const redirectSignal=Object.assign(new Error("NEXT_REDIRECT"),{digest:"NEXT_REDIRECT;replace;/admin-preview-unavailable;307;"});
  mocks.read.mockRejectedValue(redirectSignal);
  await expect(AppLayout({children:<p>Protected page</p>})).rejects.toBe(redirectSignal);
  expect(mocks.from).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
});
