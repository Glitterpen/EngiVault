import Link from "next/link";
import {ArrowLeft,Eye,ShieldCheck} from "lucide-react";
import {Brand} from "@/components/brand";
import {AccountMenu} from "@/components/account-menu";
import {requireAuthenticatedUser} from "@/lib/auth";
import {requireFounderIdentity} from "@/lib/founder";

export default async function FounderLayout({children}:{children:React.ReactNode}){
  await requireFounderIdentity();
  const {user}=await requireAuthenticatedUser();
  return <div className="min-h-screen bg-[#f3f6f8]">
    <header className="sticky top-0 z-40 border-b border-[#dfe6ec] bg-white/95 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-[1900px] items-center justify-between px-4 sm:px-6 lg:px-8"><div className="flex items-center gap-3"><Brand href="/founder" compact/><span className="hidden h-7 w-px bg-[#dfe6ec] sm:block"/><span className="hidden items-center gap-2 text-xs font-extrabold uppercase tracking-[.14em] text-[#10243e] sm:flex"><ShieldCheck size={15} className="text-[#e8733f]"/> Founder control centre</span></div><div className="flex items-center gap-2"><Link href="/app" className="hidden h-10 items-center gap-2 rounded-xl border border-[#dce4ea] bg-white px-3 text-xs font-bold text-[#4f6074] transition hover:border-[#becbd5] sm:inline-flex"><ArrowLeft size={15}/> Workspace</Link><AccountMenu email={user.email??"Founder account"} initialRoleLabel="Founder"/></div></div></header>
    <div className="border-b border-[#dce5eb] bg-[#10243e] text-white"><div className="mx-auto flex max-w-[1900px] items-center gap-2 px-4 py-2 text-xs text-[#cbd8e7] sm:px-6 lg:px-8"><Eye size={14} className="text-[#f08550]"/><strong className="text-white">Read-only oversight.</strong> Access is MFA-protected and every visit is recorded.</div></div>
    {children}
  </div>;
}

