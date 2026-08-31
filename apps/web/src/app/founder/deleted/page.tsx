import Link from "next/link";
import {ArrowLeft,ArrowRight,Search,Trash2} from "lucide-react";
import {getFounderPortfolio} from "@/lib/founder";

export const metadata={title:"Deleted organisation accounts"};

export default async function DeletedFounderAccountsPage({searchParams}:{searchParams:Promise<{q?:string}>}){
  const {q:raw=""}=await searchParams;
  const q=raw.slice(0,100);
  const portfolio=await getFounderPortfolio({search:q,status:"deleted"});
  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-11">
    <Link href="/founder" className="inline-flex items-center gap-2 text-sm font-bold text-[#0c684e]"><ArrowLeft size={16}/> Current organisation portfolio</Link>
    <div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.16em] text-[#b04b3d]"><Trash2 size={14}/> Housekeeping archive</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-[#10243e]">Deleted organisation accounts</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#617083]">Deleted tenants are kept outside the active portfolio. Retained information is shown only where required for account, security and audit continuity.</p></div><span className="rounded-full border border-[#e1d1cf] bg-[#fff8f7] px-3 py-1.5 text-xs font-bold text-[#9c453a]">{portfolio.summary.deleted_organisations} deleted</span></div>
    <form className="ev-card mt-6 flex flex-col gap-3 p-4 sm:flex-row"><label className="min-w-0 flex-1"><span className="ev-label">Search deleted accounts</span><span className="relative block"><Search className="absolute left-3 top-3.5 text-[#8795a5]" size={16}/><input name="q" defaultValue={q} className="ev-input pl-9" placeholder="Organisation name, administrator email or slug"/></span></label><button className="ev-button self-end">Search</button>{q&&<Link href="/founder/deleted" className="ev-button-secondary self-end">Clear</Link>}</form>
    <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{portfolio.organisations.map(organisation=><article key={organisation.id} className="ev-card overflow-hidden border-[#e5d8d6]"><div className="p-5"><div className="flex items-start justify-between gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[#f7ecea] font-bold text-[#9e463b]">{organisation.name.slice(0,2).toUpperCase()}</span><span className="rounded-full bg-[#f6e8e6] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] text-[#9e463b]">Deleted</span></div><h2 className="mt-4 font-semibold text-[#10243e]">{organisation.name}</h2><p className="mt-1 text-xs text-[#6e7b8a]">{organisation.owner_email??"Administrator identity removed"}</p><dl className="mt-5 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[#83909f]">Projects retained</dt><dd className="mt-1 font-bold text-[#10243e]">{organisation.active_projects+organisation.archived_projects}</dd></div><div><dt className="text-[#83909f]">MDR records</dt><dd className="mt-1 font-bold text-[#10243e]">{organisation.total_documents}</dd></div><div className="col-span-2"><dt className="text-[#83909f]">Created</dt><dd className="mt-1 font-semibold text-[#526276]">{formatDate(organisation.created_at)}</dd></div></dl></div><Link href={`/founder/organisations/${organisation.id}`} className="flex items-center justify-between border-t border-[#eadfdd] bg-[#fffafa] px-5 py-3 text-xs font-bold text-[#8d4339]">View retained account data <ArrowRight size={14}/></Link></article>)}{!portfolio.organisations.length&&<div className="ev-card p-10 text-center text-sm text-[#718093] md:col-span-2 xl:col-span-3">No deleted organisation matches this search.</div>}</section>
  </main>;
}

function formatDate(value:string){return new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(value))}

