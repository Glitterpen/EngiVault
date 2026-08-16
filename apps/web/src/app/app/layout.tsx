import Link from "next/link";
import {redirect} from "next/navigation";
import { Bell } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireUser } from "@/lib/auth";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import {readAdminPreview} from "@/lib/admin-preview";
import {AdminPreviewBoundary} from "@/components/admin-preview-boundary";
import {AccountMenu} from "@/components/account-menu";
import {roleLabel} from "@/lib/role-experience";

export default async function AppLayout({children}:{children:React.ReactNode}){
  const {supabase,user}=await requireUser();
  const preview=await readAdminPreview();
  const [{count:unreadCount},{data:organisations},{data:projectAccess}]=await Promise.all([
    supabase.from("notifications").select("id",{count:"exact",head:true}).eq("recipient_user_id",user.id).is("read_at",null),
    supabase.rpc("get_my_organisations"),
    supabase.from("project_access").select("role"),
  ]);
  const roles=[...(organisations??[]).map((item:{role:string})=>String(item.role)),...(projectAccess??[]).map(item=>String(item.role))];
  const loginRoles=new Set(["organisation_admin","project_admin","document_controller","engineer"]);
  if(!roles.some(role=>loginRoles.has(role))){
    if(user.user_metadata?.onboarding_mode==="organisation")redirect("/organisation/setup");
    redirect("/auth/access-denied");
  }
  const initialRole=preview?.role??preferredRole(roles);
  return <div className="min-h-screen">
    <header className="sticky top-0 z-40 border-b border-[#e2e7ed] bg-white/90 shadow-[0_1px_8px_rgba(16,36,62,.035)] backdrop-blur-xl"><div className="workspace-header-inner mx-auto flex h-16 items-center justify-between px-4 sm:px-6"><Brand href="/app" compact/><div className="flex items-center gap-2 sm:gap-3"><Link href="/app/notifications" className="relative grid size-10 place-items-center rounded-xl border border-[#dde4eb] bg-white text-[#647386] transition hover:border-[#ed7138] hover:bg-[#fff8f4] hover:text-[#ed7138]" title={`${unreadCount??0} unread notifications`} aria-label={`Notifications, ${unreadCount??0} unread`}><Bell size={17}/>{Boolean(unreadCount)&&<span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-[#ed7138] px-1 text-[10px] font-extrabold leading-5 text-white ring-2 ring-white">{(unreadCount??0)>99?"99+":unreadCount}</span>}</Link><AccountMenu email={user.email??"Signed-in account"} initialRoleLabel={roleLabel(initialRole)}/></div></div></header>
    <div className="workspace-shell relative mx-auto"><WorkspaceNavigation unreadCount={unreadCount??0}/><div className="md:ml-[248px] 2xl:ml-[264px]"><AdminPreviewBoundary preview={preview}><main className="workspace-main min-h-[calc(100vh-64px)] min-w-0 p-5 lg:p-8 2xl:p-10">{children}</main></AdminPreviewBoundary></div></div>
  </div>
}

function preferredRole(roles:string[]){const order=["organisation_admin","project_admin","document_controller","engineer","viewer"];return order.find(role=>roles.includes(role))??"viewer"}
