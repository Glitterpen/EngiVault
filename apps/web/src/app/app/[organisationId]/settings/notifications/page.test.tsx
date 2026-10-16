import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import NotificationSettings from "./page";

const mocks=vi.hoisted(()=>({rpc:vi.fn(),requireUser:vi.fn(),preview:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireUser:mocks.requireUser}));
vi.mock("@/lib/admin-preview",()=>({readAdminPreview:mocks.preview}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("not found");}}));
vi.mock("@/app/app/notification-preference-actions",()=>({saveNotificationPreferences:vi.fn()}));
const organisationId="a0000000-0000-4000-8000-000000000001";
const projectId="b0000000-0000-4000-8000-000000000001";
const params=Promise.resolve({organisationId});
beforeEach(()=>{
 mocks.rpc.mockReset();mocks.requireUser.mockReset();mocks.preview.mockReset();
 mocks.preview.mockResolvedValue(null);
 mocks.requireUser.mockResolvedValue({supabase:{rpc:mocks.rpc}});
 mocks.rpc.mockResolvedValue({data:{emailEnabled:true,disciplines:null,events:null,choices:["Process"]},error:null});
});
afterEach(cleanup);

it("loads organisation email preferences with the original scope and a compact heading",async()=>{
 render(await NotificationSettings({params,searchParams:Promise.resolve({})}));
 expect(mocks.rpc).toHaveBeenCalledWith("get_my_notification_email_preferences",{target_organisation:organisationId,target_project:null});
 expect(screen.getByRole("heading",{name:"My email notifications",level:1})).toBeTruthy();
 expect(screen.getByRole("link",{name:"Back to settings"}).getAttribute("href")).toBe(`/app/${organisationId}/settings`);
 expect(screen.getByText("In-app notifications: All enabled")).toBeTruthy();
});
it("keeps project-level preferences and return navigation scoped to the project",async()=>{
 render(await NotificationSettings({params,searchParams:Promise.resolve({projectId})}));
 expect(mocks.rpc).toHaveBeenCalledWith("get_my_notification_email_preferences",{target_organisation:organisationId,target_project:projectId});
 expect(screen.getByRole("link",{name:"Back to settings"}).getAttribute("href")).toBe(`/app/${organisationId}/projects/${projectId}/settings`);
 const form=screen.getByRole("button",{name:"Save my email preferences"}).closest("form")!;
 expect(new FormData(form).get("projectId")).toBe(projectId);
});
it("does not fetch or expose editable personal preferences during a member preview",async()=>{
 mocks.preview.mockResolvedValue({id:"preview"});
 render(await NotificationSettings({params,searchParams:Promise.resolve({})}));
 expect(mocks.rpc).not.toHaveBeenCalled();
 expect(screen.queryByRole("button",{name:"Save my email preferences"})).toBeNull();
 expect(screen.getByText(/Exit member preview/)).toBeTruthy();
});
it("fails safely without showing private diagnostics when preferences are unavailable",async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:{message:"private database diagnostic"}});
 render(await NotificationSettings({params,searchParams:Promise.resolve({})}));
 expect(screen.getByRole("alert").textContent).toContain("Email preferences are unavailable");
 expect(screen.queryByText("private database diagnostic")).toBeNull();
 expect(screen.queryByRole("button",{name:"Save my email preferences"})).toBeNull();
});
it("rejects an invalid organisation before loading an account",async()=>{
 await expect(NotificationSettings({params:Promise.resolve({organisationId:"invalid"}),searchParams:Promise.resolve({})})).rejects.toThrow("not found");
 expect(mocks.requireUser).not.toHaveBeenCalled();
});
it("rejects an invalid project before loading an account",async()=>{
 await expect(NotificationSettings({params,searchParams:Promise.resolve({projectId:"invalid"})})).rejects.toThrow("not found");
 expect(mocks.requireUser).not.toHaveBeenCalled();
});
