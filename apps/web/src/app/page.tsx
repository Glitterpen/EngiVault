import {
  ArrowRight,
  Check,
  FileCheck2,
  Fingerprint,
  LockKeyhole,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";

const earlyAccessFormAction = "https://formsubmit.co/df53e103555f05354c758393cdc06861";

const capabilities = [
  {
    no: "01",
    icon: FileCheck2,
    title: "Plan and control the MDR",
    body: "Structure every deliverable by project and discipline, with clear ownership, submission dates and required issue status.",
  },
  {
    no: "02",
    icon: ShieldCheck,
    title: "Govern every submission",
    body: "Receive secure discipline-scoped revisions, preserve their history and route each file through DCC conformance review.",
  },
  {
    no: "03",
    icon: ScanSearch,
    title: "Retrieve answers with proof",
    body: "Find authorised project information and trace every result to its document number, revision and source location.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f6f8]">
      <nav className="relative z-20 mx-auto flex max-w-[1440px] items-center justify-between px-6 py-6 lg:px-12">
        <Brand />
        <div className="hidden items-center gap-8 text-sm font-semibold text-[#617083] md:flex">
          <a href="#platform" className="transition hover:text-[#10243e]">Platform</a>
          <a href="#security" className="transition hover:text-[#10243e]">Security</a>
          <a href="#early-access" className="transition hover:text-[#10243e]">Early access</a>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className="ev-button-secondary">Sign in</Link>
          <Link href="/app" className="ev-button">Open workspace <ArrowRight size={16} /></Link>
        </div>
      </nav>

      <section className="mx-auto grid max-w-[1440px] gap-12 px-6 pb-24 pt-10 lg:grid-cols-[.92fr_1.08fr] lg:px-12 lg:pb-32 lg:pt-16">
        <div className="relative z-10 flex flex-col justify-center">
          <div className="mb-7 flex w-fit items-center gap-3 rounded-full border border-[#dce2e9] bg-white px-3.5 py-2 text-[10px] font-extrabold uppercase tracking-[.18em] text-[#617083] shadow-sm">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#e8733f] opacity-40" />
              <span className="relative inline-flex size-2 rounded-full bg-[#e8733f]" />
            </span>
            Engineering document control and intelligence
          </div>
          <h1 className="max-w-3xl text-[clamp(3.25rem,6vw,6.8rem)] font-semibold leading-[.91] tracking-[-.067em]">
            Control every deliverable.<br />
            <span className="text-[#e8733f]">Cite every decision.</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-[#617083]">
            EngiCite gives oil-and-gas project teams one secure workspace to plan the MDR,
            coordinate discipline submissions, control revisions and retrieve project
            knowledge with verifiable proof.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/login" className="ev-button">Enter workspace <ArrowRight size={16} /></Link>
            <Link href="/register" className="ev-button-secondary">Create account</Link>
            <a href="#platform" className="ev-button-secondary">See how it works</a>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-xs font-bold uppercase tracking-[.08em] text-[#617083]">
            {["MDR controlled", "Discipline governed", "Evidence cited"].map((item) => (
              <span key={item} className="flex items-center gap-2">
                <Check size={14} className="text-[#e8733f]" />{item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative min-h-[590px]">
          <div className="engineering-grid absolute inset-0 rounded-[30px] bg-[#10243e] shadow-[0_32px_80px_rgba(16,36,62,.22)]" />
          <div className="absolute -right-14 -top-14 size-52 rounded-full border-[38px] border-[#e8733f]/15" />
          <div className="relative p-5 sm:p-8 lg:p-10">
            <div className="mb-6 flex items-center justify-between text-white">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.2em] text-white/45">Workspace overview</p>
                <p className="mt-2 text-lg font-bold">Orion LNG Expansion</p>
              </div>
              <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs">
                <LockKeyhole size={12} className="text-[#ff9a6d]" /> Private workspace
              </span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[.07] p-4 backdrop-blur sm:p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Sparkles size={17} className="text-[#ff9a6d]" /> Ask EngiCite
              </div>
              <p className="mt-5 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#10243e]">
                What is the export line design pressure?
              </p>
              <div className="mt-3 rounded-xl bg-[#172f4c] p-4 text-sm leading-6 text-white/70">
                <p>
                  The export line design pressure is <b className="text-white">95 barg</b>,
                  based on the approved pipeline design basis.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-md bg-[#e8733f] px-2.5 py-1 text-[11px] font-extrabold text-white">OL-PIP-001</span>
                  <span className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white">REV C02</span>
                  <span className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white">PAGE 18</span>
                </div>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Metric value="1,248" label="MDR deliverables" />
              <Metric value="98.4%" label="Register health" />
              <Metric value="100%" label="Answers cited" />
            </div>
            <div className="mt-5 space-y-2">
              <Document n="OL-PFD-014" title="Gas compression process flow" rev="B04" />
              <Document n="OL-INS-207" title="Cause & effect matrix" rev="A07" />
            </div>
            <p className="mt-4 text-center text-[10px] font-semibold uppercase tracking-[.14em] text-white/30">
              Illustrative project data · EngiCite workflow
            </p>
          </div>
        </div>
      </section>

      <section id="platform" className="bg-white py-24">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr]">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#e8733f]">One controlled workflow</p>
              <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-.05em] sm:text-5xl">
                From MDR planning to final handover.
              </h2>
            </div>
            <p className="max-w-xl self-end text-lg leading-8 text-[#617083]">
              Purpose-built for organisation leaders, project teams, document controllers
              and discipline engineers working across complex oil-and-gas deliverables.
            </p>
          </div>
          <div className="mt-14 grid border-y border-[#dce2e9] md:grid-cols-3">
            {capabilities.map(({ no, icon: Icon, title, body }, index) => (
              <article
                key={title}
                className={`py-9 md:px-8 ${index > 0 ? "border-t border-[#dce2e9] md:border-l md:border-t-0" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#e8733f]">{no}</span>
                  <Icon size={22} />
                </div>
                <h3 className="mt-12 text-xl font-bold">{title}</h3>
                <p className="mt-3 leading-7 text-[#617083]">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="security" className="bg-[#10243e] py-20 text-white">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-6 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:px-12">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 text-xs font-extrabold uppercase tracking-[.18em] text-[#ff9a6d]">
              <ShieldCheck size={18} /> Security by architecture
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">
              Project access follows project responsibility.
            </h2>
            <p className="mt-4 leading-7 text-white/60">
              EngiCite separates every organisation, project and role, protects files with
              time-limited access and records critical document activity for accountability.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <SecurityPoint
              icon={<Fingerprint size={20} />}
              title="Documents remain private"
              body="Customer documents are not used to train models."
            />
            <SecurityPoint
              icon={<LockKeyhole size={20} />}
              title="Roles define access"
              body="Administrators, DCCs, engineers and viewers see only their authorised responsibilities."
            />
          </div>
        </div>
      </section>

      <section id="early-access" className="relative overflow-hidden bg-[#f4f6f8] py-24">
        <div className="absolute left-1/2 top-1/2 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e8733f]/[.07] blur-3xl" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#e8733f]">Early access</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-.05em] sm:text-5xl">
            Bring us your document challenge.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#617083]">
            Tell us how your team manages the MDR, discipline submissions, document reviews
            and final handover. We&apos;ll contact you about early access to EngiCite.
          </p>
          <form
            action={earlyAccessFormAction}
            method="POST"
            className="mx-auto mt-9 max-w-3xl rounded-2xl border border-[#dce2e9] bg-white p-6 text-left shadow-[0_18px_50px_rgba(16,36,62,.07)] sm:p-8"
          >
            <input type="hidden" name="_subject" value="New EngiCite early-access enquiry" />
            <input type="hidden" name="_template" value="table" />
            <input type="hidden" name="_captcha" value="false" />
            <input type="hidden" name="_next" value="https://engicite.com/?sent=1#early-access" />
            <div className="grid gap-5 sm:grid-cols-2">
              <ContactField label="Name" name="name" autoComplete="name" required />
              <ContactField label="Work email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="mt-5">
              <ContactField label="Company" name="company" autoComplete="organization" />
            </div>
            <label htmlFor="early-access-message" className="mt-5 block text-[11px] font-extrabold uppercase tracking-[.08em] text-[#617083]">
              How can EngiCite help your team?
            </label>
            <textarea
              id="early-access-message"
              name="message"
              required
              rows={5}
              className="mt-2 w-full resize-y rounded-xl border border-[#ced6df] bg-white px-4 py-3 text-sm text-[#10243e] outline-none transition focus:border-[#e8733f] focus:ring-4 focus:ring-[#e8733f]/10"
            />
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button type="submit" className="ev-button">Send enquiry <ArrowRight size={16} /></button>
              <p className="text-xs text-[#617083]">Your details will only be used to respond to this enquiry.</p>
            </div>
          </form>
        </div>
      </section>

      <footer className="bg-[#0b1b2f] py-7 text-white/45">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-6 text-xs sm:flex-row sm:items-center sm:justify-between lg:px-12">
          <span>© 2026 EngiCite. All rights reserved.</span>
          <span>Know the answer. Cite the proof.</span>
        </div>
      </footer>
    </main>
  );
}

function ContactField({
  label,
  name,
  type = "text",
  autoComplete,
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const id = `early-access-${name}`;
  return (
    <label htmlFor={id} className="block text-[11px] font-extrabold uppercase tracking-[.08em] text-[#617083]">
      {label}
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className="mt-2 w-full rounded-xl border border-[#ced6df] bg-white px-4 py-3 text-sm font-normal normal-case tracking-normal text-[#10243e] outline-none transition focus:border-[#e8733f] focus:ring-4 focus:ring-[#e8733f]/10"
      />
    </label>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[.06] p-4 text-white">
      <p className="text-xl font-bold">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[.1em] text-white/40">{label}</p>
    </div>
  );
}

function Document({ n, title, rev }: { n: string; title: string; rev: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0d2037]/70 p-3 text-white">
      <span className="grid size-9 place-items-center rounded-lg bg-white/10"><FileCheck2 size={16} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold tracking-[.08em] text-[#ff9a6d]">{n}</p>
        <p className="truncate text-xs font-semibold text-white/75">{title}</p>
      </div>
      <span className="text-[10px] font-bold text-white/45">REV {rev}</span>
    </div>
  );
}

function SecurityPoint({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-5">
      <span className="mt-0.5 text-[#ff9a6d]">{icon}</span>
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-1 text-xs leading-5 text-white/50">{body}</p>
      </div>
    </div>
  );
}
