import { CheckCircle2, Quote } from "lucide-react";
import { Brand } from "@/components/brand";

export default function AuthLayout({children}:{children:React.ReactNode}) {
  return <main className="grid min-h-screen lg:grid-cols-[.9fr_1.1fr]">
    <section className="engineering-grid relative flex min-h-[380px] flex-col overflow-hidden bg-[#10243e] p-8 text-white lg:min-h-screen lg:p-14">
      <div className="absolute -bottom-28 -right-28 size-80 rounded-full border-[64px] border-[#e8733f]/15" />
      <Brand inverse />
      <div className="relative my-auto max-w-lg py-16">
        <p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#ff9a6d]">Authorised evidence only</p>
        <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-.05em] lg:text-6xl">Every answer should stand up to scrutiny.</h1>
        <p className="mt-6 max-w-md leading-7 text-white/60">Secure project intelligence with the source, revision and page attached.</p>
        <div className="mt-9 space-y-3 text-sm font-semibold text-white/75">{["Tenant-isolated workspaces","Role-controlled project access","Page-level answer citations"].map(x=><p key={x} className="flex items-center gap-3"><CheckCircle2 size={17} className="text-[#ff9a6d]"/>{x}</p>)}</div>
      </div>
      <div className="relative flex items-center gap-3 text-xs text-white/40"><Quote size={15}/> Engineering intelligence, evidenced.</div>
    </section>
    <section className="grid place-items-center bg-white px-6 py-12">{children}</section>
  </main>
}
