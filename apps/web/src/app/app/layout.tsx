import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireUser } from "@/lib/auth";
import { signOut } from "../(auth)/actions";
import { WorkspaceNavigation } from "@/components/workspace-navigation";

export default async function AppLayout({children}:{children:React.ReactNode}){
  const {supabase,user}=await requireUser();
  const {count:unreadCount}=await supabase.from("notifications").select("id",{count:"exact",head:true}).eq("recipient_user_id",user.id).is("read_at",null);
  const initial=(user.email?.[0]??"U").toUpperCase();
  return <div className="min-h-screen">
    <header className="sticky top-0 z-40 border-b border-[#e2e7ed] bg-white/90 shadow-[0_1px_8px_rgba(16,36,62,.035)] backdrop-blur-xl"><div className="workspace-header-inner mx-auto flex h-16 items-center justify-between px-4 sm:px-6"><Brand href="/app" compact/><div className="flex items-center gap-2 sm:gap-3"><Link href="/app/notifications" className="relative grid size-10 place-items-center rounded-xl border border-[#dde4eb] bg-white text-[#647386] transition hover:border-[#ed7138] hover:bg-[#fff8f4] hover:text-[#ed7138]" title={`${unreadCount??0} unread notifications`} aria-label={`Notifications, ${unreadCount??0} unread`}><Bell size={17}/>{Boolean(unreadCount)&&<span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-[#ed7138] px-1 text-[10px] font-extrabold leading-5 text-white ring-2 ring-white">{(unreadCount??0)>99?"99+":unreadCount}</span>}</Link><div className="hidden items-center gap-2.5 rounded-full border border-[#e1e7ec] bg-[#f8fafb] py-1.5 pl-1.5 pr-3 sm:flex"><span className="grid size-7 place-items-center rounded-full bg-[#10243e] text-xs font-bold text-white">{initial}</span><span className="max-w-56 truncate text-xs font-medium text-[#58687b]">{user.email}</span></div><form action={signOut}><button className="grid size-10 place-items-center rounded-xl border border-[#dde4eb] bg-white text-[#647386] transition hover:border-[#ed7138] hover:bg-[#fff8f4] hover:text-[#ed7138]" title="Sign out" aria-label="Sign out"><LogOut size={17}/></button></form></div></div></header>
    <div className="workspace-shell relative mx-auto"><WorkspaceNavigation unreadCount={unreadCount??0}/><div className="md:ml-[248px] 2xl:ml-[264px]"><main className="workspace-main min-h-[calc(100vh-64px)] min-w-0 p-5 lg:p-8 2xl:p-10">{children}</main></div></div>
  </div>
}
