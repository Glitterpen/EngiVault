"use client";

import { CheckCircle2, Quote } from "lucide-react";
import { Brand } from "@/components/brand";
import {usePathname} from "next/navigation";

export default function AuthLayout({children}:{children:React.ReactNode}) {
  const pathname=usePathname();
  const registration=pathname==="/register";
  if(pathname==="/login"||registration)return <main className={`flex min-h-svh min-w-0 flex-col items-center justify-center bg-white px-2 py-6 min-[360px]:px-5 sm:bg-[#f6f8fb] sm:px-6 ${registration?"sm:py-6":"sm:py-10"}`}>
    <div className={`w-full min-w-0 ${registration?"max-w-[560px]":"max-w-[440px]"}`}>
      <header className={registration?"mb-4 flex justify-center":"mb-5 flex justify-center sm:mb-6"}><Brand/></header>
      <section aria-label={registration?"EngiCite registration":"EngiCite sign in"} className={`min-w-0 sm:rounded-2xl sm:border sm:border-[#d6e0ed] sm:bg-white sm:shadow-[0_8px_32px_rgba(16,36,62,.04)] ${registration?"sm:p-6":"sm:p-7"}`}>{children}</section>
      <footer className={`${registration?"mt-4":"mt-5"} text-center text-xs leading-5 text-[#617083]`}>EngiCite · Engineering delivery, connected.</footer>
    </div>
  </main>;
  return <main className="grid min-h-screen lg:grid-cols-[.9fr_1.1fr]">
    <section className="engineering-grid relative flex min-h-[380px] flex-col overflow-hidden bg-[#10243e] p-8 text-white lg:min-h-screen lg:p-14">
      <div className="absolute -bottom-28 -right-28 size-80 rounded-full border-[64px] border-[#e8733f]/15" />
      <Brand inverse />
      <div className="relative my-auto max-w-lg py-16">
        <p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#ff9a6d]">Engineering delivery, under control</p>
        <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-.05em] lg:text-6xl">One controlled record from planned deliverable to client issue.</h1>
        <p className="mt-6 max-w-lg leading-7 text-white/65">EngiCite brings the master document register, discipline submissions, revision review, project progress, transmittals and evidence-cited document intelligence into one secure workspace.</p>
        <div className="mt-9 space-y-3 text-sm font-semibold text-white/80">{[
          "Discipline-specific submission and DCC review",
          "Progress measured through every required issue stage",
          "Client-ready transmittals with a complete audit trail",
          "Document answers cited by number, revision and page",
        ].map(x=><p key={x} className="flex items-center gap-3"><CheckCircle2 size={17} className="shrink-0 text-[#ff9a6d]"/>{x}</p>)}</div>
      </div>
      <div className="relative flex items-center gap-3 text-xs text-white/45"><Quote size={15}/> Plan it. Submit it. Review it. Issue it. Cite it.</div>
    </section>
    <section className="grid place-items-center bg-white px-6 py-12">{children}</section>
  </main>
}
