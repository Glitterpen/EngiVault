import Link from "next/link";
import { ArrowRight, FileCheck2, LockKeyhole, Search, Sparkles } from "lucide-react";

const features = [
  { icon: FileCheck2, title: "One controlled register", body: "Document metadata, immutable revisions and processing status in a project-specific MDR." },
  { icon: Search, title: "Find engineering evidence", body: "Exact metadata and semantic retrieval designed around document numbers, revisions and pages." },
  { icon: Sparkles, title: "Answers with provenance", body: "Selected-document chat that must link every factual answer back to approved project evidence." },
];

export default function Home() {
  return <main className="min-h-screen overflow-hidden bg-[#f5f7f5]">
    <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
      <Link href="/" className="flex items-center gap-3 font-semibold"><span className="grid size-10 place-items-center rounded-xl bg-[#0c5b45] text-[#c9f36b]"><LockKeyhole size={19}/></span><span>EngiVault <b className="text-[#0c5b45]">AI</b></span></Link>
      <div className="flex items-center gap-3"><Link href="/login" className="ev-button-secondary">Sign in</Link><Link href="/register" className="ev-button hidden sm:inline-flex">Create account <ArrowRight size={16}/></Link></div>
    </nav>
    <section className="mx-auto grid max-w-7xl gap-14 px-6 pb-20 pt-16 [&>*]:min-w-0 lg:grid-cols-[1.08fr_.92fr] lg:px-10 lg:pt-24">
      <div><div className="mb-6 inline-flex max-w-full items-center gap-2 rounded-full border border-[#bed2c9] bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[#0c5b45] sm:text-xs sm:tracking-[.14em]"><span className="size-2 shrink-0 rounded-full bg-[#78a700]"/>Controlled knowledge, clear answers</div>
        <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-.05em] sm:text-7xl">Engineering truth,<br/><span className="text-[#0c5b45]">ready when it matters.</span></h1>
        <p className="mt-7 max-w-xl text-lg leading-8 text-[#65736f]">A secure document intelligence workspace for oil-and-gas teams. Control revisions, search project evidence, and ask questions with page-level citations.</p>
        <div className="mt-9 flex flex-wrap gap-3"><Link href="/register" className="ev-button">Start secure workspace <ArrowRight size={16}/></Link><a href="#capabilities" className="ev-button-secondary">Explore capabilities</a></div>
        <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-[#65736f]"><span>✓ Tenant-isolated</span><span>✓ Role controlled</span><span>✓ Audit ready</span></div>
      </div>
      <div className="relative"><div className="absolute -inset-8 -z-0 rounded-full bg-[#c9f36b]/25 blur-3xl"/><div className="ev-card relative overflow-hidden p-4"><div className="rounded-xl bg-[#10231f] p-5 text-white"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[.16em] text-white/55">North Field Expansion</p><p className="mt-1 font-semibold">Project document health</p></div><span className="rounded-full bg-[#c9f36b] px-3 py-1 text-xs font-bold text-[#10231f]">98.4%</span></div><div className="mt-8 grid grid-cols-3 gap-3"><Stat v="1,248" l="Documents"/><Stat v="87" l="New revisions"/><Stat v="3" l="Actions"/></div></div><div className="space-y-3 p-4"><Doc n="EV-PIP-001" t="Export pipeline design basis" r="C02"/><Doc n="EV-PFD-014" t="Gas compression process flow" r="B04"/><Doc n="EV-INS-207" t="Cause and effect matrix" r="A07"/></div><div className="mx-4 mb-4 rounded-xl border border-[#dfe7e3] bg-[#f5f7f5] p-4 text-sm"><p className="font-semibold">What is the export line design pressure?</p><p className="mt-2 leading-6 text-[#65736f]">The export line design pressure is <b className="text-[#10231f]">95 barg</b>. <span className="rounded bg-[#dff5a8] px-1.5 py-0.5 text-xs font-bold text-[#0c5b45]">EV-PIP-001 · C02 · p.18</span></p></div></div></div>
    </section>
    <section id="capabilities" className="border-t border-[#dfe7e3] bg-white"><div className="mx-auto grid max-w-7xl gap-5 px-6 py-20 md:grid-cols-3 lg:px-10">{features.map(({icon:Icon,title,body})=><article key={title} className="rounded-2xl border border-[#dfe7e3] p-6"><Icon className="text-[#0c5b45]"/><h2 className="mt-8 text-xl font-semibold">{title}</h2><p className="mt-3 leading-7 text-[#65736f]">{body}</p></article>)}</div></section>
  </main>;
}
function Stat({v,l}:{v:string;l:string}) { return <div><p className="text-2xl font-semibold">{v}</p><p className="mt-1 text-xs text-white/50">{l}</p></div> }
function Doc({n,t,r}:{n:string;t:string;r:string}) { return <div className="flex items-center gap-3 rounded-xl border border-[#dfe7e3] p-3"><span className="grid size-10 place-items-center rounded-lg bg-[#e9f2ed] text-[#0c5b45]"><FileCheck2 size={18}/></span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-[#0c5b45]">{n}</p><p className="truncate text-sm font-medium">{t}</p></div><span className="rounded-md bg-[#f5f7f5] px-2 py-1 text-xs font-bold">{r}</span></div> }
