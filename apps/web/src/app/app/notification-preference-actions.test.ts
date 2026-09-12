import {beforeEach,expect,it,vi} from "vitest";
import {saveNotificationPreferences} from "./notification-preference-actions";
import {requireUser} from "@/lib/auth";
import {readAdminPreview} from "@/lib/admin-preview";
vi.mock("@/lib/auth",()=>({requireUser:vi.fn()}));
vi.mock("@/lib/admin-preview",()=>({readAdminPreview:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
const rpc=vi.fn();
const org="81000000-0000-4000-8000-000000000001";
beforeEach(()=>{vi.clearAllMocks();vi.mocked(readAdminPreview).mockResolvedValue(null);vi.mocked(requireUser).mockResolvedValue({supabase:{rpc}} as never);rpc.mockResolvedValue({error:null});});
function form(){const f=new FormData();f.set("organisationId",org);f.set("emailEnabled","on");return f;}
it("saves personal selections without accepting a caller-supplied user identity",async()=>{
 const f=form();f.set("userId","victim");f.append("disciplines","Process");f.append("events","submissions");
 expect((await saveNotificationPreferences({},f)).ok).toBe(true);
 expect(rpc).toHaveBeenCalledWith("set_my_notification_email_preferences",{target_organisation:org,target_project:null,enabled:true,selected_disciplines:["Process"],selected_events:["submissions"]});
});
it("preserves all versus empty selections",async()=>{
 const f=form();await saveNotificationPreferences({},f);expect(rpc.mock.calls[0][1].selected_events).toEqual([]);
 f.set("allEvents","on");f.set("allDisciplines","on");await saveNotificationPreferences({},f);expect(rpc.mock.calls[1][1]).toMatchObject({selected_events:null,selected_disciplines:null});
});
it("blocks audited preview",async()=>{vi.mocked(readAdminPreview).mockResolvedValue({} as never);expect((await saveNotificationPreferences({},form())).ok).toBeUndefined();expect(rpc).not.toHaveBeenCalled();});
it("rejects invalid events",async()=>{const f=form();f.set("events","injected");await saveNotificationPreferences({},f);expect(rpc).not.toHaveBeenCalled();});
it("does not report success after database access denial",async()=>{rpc.mockResolvedValue({error:{code:"42501"}});expect((await saveNotificationPreferences({},form())).ok).toBeUndefined();});
