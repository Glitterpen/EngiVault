import { LogOut } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireUser } from "@/lib/auth";
import { signOut } from "../(auth)/actions";
import { WorkspaceNavigation } from "@/components/workspace-navigation";

export default async function AppLayout({children}:{children:React.ReactNode}){
  const {user}=await requireUser();
  return <div className="min-h-screen bg-[#f4f6f8]">
    <header className="sticky top-0 z-20 border-b border-[#dce2e9] bg-white/95 backdrop-blur"><div className="mx-auto flex h-[68px] max-w-[1500px] items-center justify-between px-5"><Brand href="/app" compact/><div className="flex items-center gap-4"><span className="hidden text-sm text-[#617083] sm:inline">{user.email}</span><form action={signOut}><button className="grid size-9 place-items-center rounded-lg border border-[#dce2e9] text-[#617083] transition hover:border-[#e8733f] hover:text-[#e8733f]" title="Sign out"><LogOut size={16}/></button></form></div></div></header>
    <div className="relative mx-auto max-w-[1500px]"><WorkspaceNavigation/><div className="md:ml-[240px]"><main className="min-h-[calc(100vh-68px)] min-w-0 p-5 lg:p-8">{children}</main></div></div>
  </div>
}
