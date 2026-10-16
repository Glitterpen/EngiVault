import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, ChartNoAxesCombined, Check, ChevronDown, FileCheck2,
  Folder, FolderOpen, ListChecks, ScanSearch, Send, ShieldCheck, Users,
} from "lucide-react";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Engineering delivery, clearly controlled",
  description: "Bring your master document register, discipline submissions, DCC reviews, transmittals and project progress into one organised workspace. EngiCite is a product of EngiOne LTD.",
};

const earlyAccessFormAction = "https://formsubmit.co/df53e103555f05354c758393cdc06861";

const capabilities = [
  { icon: FolderOpen, title: "One clear document register", body: "Import your master document register (MDR), organise deliverables by discipline and find document numbers, titles and types without the spreadsheet chase." },
  { icon: FileCheck2, title: "Follow every revision", body: "Track submissions from Issued for Review to your project’s final issue stage. Keep revision history, planned dates and assigned responsibilities together." },
  { icon: Users, title: "Keep reviews connected", body: "Let Document Control review conformance, approve or return submissions, while engineers record interdisciplinary checks against approved revisions." },
  { icon: Send, title: "Issue the right document set", body: "Distinguish newly approved, staged and previously transmitted revisions. Prepare a controlled transmittal and package its documents for handover." },
  { icon: ChartNoAxesCombined, title: "See where delivery stands", body: "Compare submitted and DCC-accepted progress against your project timeline. See discipline completion, outstanding work and overdue deliverables." },
  { icon: ScanSearch, title: "Find answers with context", body: "Search authorised project documents and, where enabled, ask EngiCite for source-linked answers. Check the cited revision and source before acting." },
];

const workflow = [
  { title: "Plan", body: "Set up disciplines, deliverables and submission dates." },
  { title: "Submit", body: "Engineers upload revisions against their assigned work." },
  { title: "Review", body: "DCC checks conformance and controls acceptance." },
  { title: "Issue", body: "Package approved revisions with a clear transmittal." },
];

export default function Home() {
  return (
    <div className="min-h-svh bg-[#f6f8f7] text-[#14263d]">
      <a href="#landing-content" className="ev-skip-link">Skip to content</a>
      <header className="border-b border-[#e1e7e4] bg-white">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Brand compact />
          <div className="hidden items-center gap-5 text-sm font-medium text-[#526675] md:flex">
            <a href="#platform" className="inline-flex min-h-11 items-center rounded-lg hover:text-[#0c5b45]">Capabilities</a>
            <a href="#workflow" className="inline-flex min-h-11 items-center rounded-lg hover:text-[#0c5b45]">How it works</a>
            <a href="#early-access" className="inline-flex min-h-11 items-center rounded-lg hover:text-[#0c5b45]">Contact</a>
          </div>
          <Link href="/login" className="ev-button-secondary shrink-0">Sign in</Link>
        </nav>
      </header>

      <main id="landing-content" tabIndex={-1}>
        <section aria-labelledby="landing-title" className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.08fr_1fr] lg:gap-14 lg:px-8 lg:py-20">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0c5b45]">Engineering delivery, clearly controlled.</p>
            <h1 id="landing-title" className="mt-4 max-w-xl text-[clamp(2.5rem,5vw,4.25rem)] font-semibold leading-[1.07] tracking-[-.045em]">
              Every deliverable.<br /><span className="text-[#0c5b45]">One clear path.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#526675] sm:text-lg sm:leading-8">
              Bring your document register, discipline submissions, reviews and transmittals into one organised workspace. Less chasing files. More clarity on what comes next.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/register" className="ev-button">Register your organisation <ArrowRight size={16} aria-hidden="true" /></Link>
              <a href="#platform" className="ev-button-secondary">Explore capabilities</a>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#526675]">Already invited to a project? <Link href="/login" className="inline-flex min-h-11 items-center rounded-lg font-semibold text-[#0c5b45] underline decoration-[#a8beb5] hover:decoration-current">Sign in to your workspace</Link></p>
            <ul aria-label="Core benefits" className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-[#526675]">
              {["Clear ownership", "Controlled revisions", "Visible progress"].map(item => <li key={item} className="flex items-center gap-1.5"><Check size={14} aria-hidden="true" className="text-[#0c5b45]" />{item}</li>)}
            </ul>
          </div>
          <DeliveryPreview />
        </section>

        <section id="platform" aria-labelledby="capabilities-title" className="scroll-mt-6 border-y border-[#e1e7e4] bg-white">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-[#0c5b45]">Built around the work</p>
              <h2 id="capabilities-title" className="mt-2 text-3xl font-semibold leading-tight tracking-[-.035em] sm:text-4xl">A connected view of engineering delivery.</h2>
              <p className="mt-3 text-base leading-7 text-[#526675]">For organisation leaders, project managers, document controllers and discipline engineers—each with a clear role in the same workflow.</p>
            </div>
            <div className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map(({ icon: Icon, title, body }) => (
                <article key={title} className="min-w-0 border-t border-[#e1e7e4] pt-5">
                  <Icon size={21} aria-hidden="true" className="text-[#0c5b45]" />
                  <h3 className="mt-3 text-base font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#526675]">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" aria-labelledby="workflow-title" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
          <h2 id="workflow-title" className="text-2xl font-semibold tracking-[-.025em] sm:text-3xl">From the first plan to the next issue.</h2>
          <ol className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map(({title, body}, index) => <li key={title} className="flex items-start gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#cedbd4] bg-white text-xs font-semibold text-[#0c5b45]" aria-hidden="true">{index + 1}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-[#526675]">{body}</p></div></li>)}
          </ol>
          <div id="security" className="mt-9 flex scroll-mt-6 items-start gap-3 rounded-xl border border-[#d9e4de] bg-[#eef4f0] px-4 py-4 sm:px-5">
            <ShieldCheck size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-[#0c5b45]" />
            <p className="text-sm leading-6 text-[#3e584d]"><strong className="font-semibold">Access follows responsibility.</strong> Organisation-controlled invitations, role-based project access and recorded key actions help keep work accountable.</p>
          </div>
        </section>

        <section id="early-access" aria-labelledby="contact-title" className="scroll-mt-6 border-y border-[#e1e7e4] bg-white">
          <div className="mx-auto grid max-w-6xl gap-7 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-2 lg:gap-14 lg:px-8">
            <div>
              <h2 id="contact-title" className="text-2xl font-semibold tracking-[-.025em] sm:text-3xl">Bring clarity to your next project.</h2>
              <p className="mt-3 max-w-lg text-sm leading-7 text-[#526675]">Register an organisation to get started, or tell us about your team’s document workflow. Individual project accounts are created through authorised invitations.</p>
              <Link href="/register" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#0c5b45] underline decoration-[#a8beb5] hover:decoration-current">Register your organisation <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
            <details className="group min-w-0 self-start rounded-2xl border border-[#dce4df] bg-[#fafcfb]">
              <summary className="flex min-h-14 list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">Send an enquiry <ChevronDown size={17} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary>
              <form aria-label="Organisation enquiry" action={earlyAccessFormAction} method="POST" className="border-t border-[#e1e7e4] p-4 sm:p-5">
                <input type="hidden" name="_subject" value="New EngiCite early-access enquiry" />
                <input type="hidden" name="_template" value="table" />
                <input type="hidden" name="_captcha" value="false" />
                <input type="hidden" name="_next" value="https://engicite.com/?sent=1#early-access" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <ContactField label="Name" name="name" autoComplete="name" />
                  <ContactField label="Work email" name="email" type="email" autoComplete="email" />
                </div>
                <div className="mt-4"><ContactField label="Company" name="company" autoComplete="organization" /></div>
                <label htmlFor="early-access-message" className="ev-label mt-4">How can EngiCite help your team?</label>
                <textarea id="early-access-message" name="message" required rows={4} className="ev-input h-auto py-3" />
                <button type="submit" className="ev-button mt-4 w-full sm:w-auto">Send enquiry <ArrowRight size={16} aria-hidden="true" /></button>
              </form>
            </details>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-xs leading-6 text-[#526675]">EngiCite is a product of <span className="font-semibold text-[#24384f]">EngiOne LTD.</span></p>
          <Image src="/engione-logo.png" alt="EngiOne LTD" width={480} height={160} sizes="160px" className="h-auto w-40" />
        </div>
        <p className="text-xs leading-6 text-[#526675]">© {new Date().getFullYear()} EngiOne LTD. All rights reserved.</p>
      </footer>
    </div>
  );
}

function ContactField({ label, name, type = "text", autoComplete }: { label: string; name: string; type?: string; autoComplete: string }) {
  const id = `early-access-${name}`;
  return <div><label htmlFor={id} className="ev-label">{label}</label><input id={id} name={name} type={type} autoComplete={autoComplete} required className="ev-input" /></div>;
}

function DeliveryPreview() {
  const documents = [
    { discipline: "Process", number: "PR-PFD-001", title: "Process flow diagram", purpose: "IFR", state: "In DCC review", tone: "bg-[#fff2e9] text-[#97451f]", folder: "text-[#b66730] bg-[#fff2e9]" },
    { discipline: "Electrical", number: "EL-SLD-001", title: "Single-line diagram", purpose: "IFA", state: "DCC accepted", tone: "bg-[#eaf3ee] text-[#0c5b45]", folder: "text-[#4368a3] bg-[#edf2fb]" },
    { discipline: "Civil & structural", number: "CS-GAD-001", title: "Foundation arrangement", purpose: "IFC", state: "Ready for transmittal", tone: "bg-[#eaf3ee] text-[#0c5b45]", folder: "text-[#78599b] bg-[#f2eef8]" },
  ];
  return (
    <figure aria-labelledby="delivery-preview-title" className="min-w-0 overflow-hidden rounded-2xl border border-[#dce4df] bg-white shadow-[0_12px_40px_rgba(20,38,61,.045)]">
      <div className="flex items-center justify-between gap-3 border-b border-[#e5ebe7] px-4 py-4 sm:px-5">
        <div><p className="text-xs text-[#526675]">A clearer workspace</p><p id="delivery-preview-title" className="mt-1 text-base font-semibold">Project deliverables</p></div>
        <ListChecks size={21} aria-hidden="true" className="shrink-0 text-[#0c5b45]" />
      </div>
      <ul className="divide-y divide-[#e8eeea] px-4 sm:px-5">
        {documents.map(document => <li key={document.number} className="py-4"><div className="flex items-center gap-2"><span className={`flex size-7 items-center justify-center rounded-lg ${document.folder}`}><Folder size={15} aria-hidden="true" /></span><p className="text-sm font-semibold">{document.discipline}</p></div><div className="ml-9 mt-2"><p className="text-sm leading-6 text-[#24384f]">{document.title}</p><div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-2"><span className="text-xs text-[#526675]">{document.number} · {document.purpose}</span><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${document.tone}`}>{document.state}</span></div></div></li>)}
      </ul>
      <figcaption className="border-t border-[#e5ebe7] bg-[#fafcfb] px-4 py-3 text-xs leading-5 text-[#526675] sm:px-5">Workflow illustration · not live project data.</figcaption>
    </figure>
  );
}
