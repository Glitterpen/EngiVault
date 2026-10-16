"use client";
import {HelpTip} from "@/components/help-tip";
import { customerErrorMessage } from "@/lib/customer-messages";


import Link from "next/link";
import {type FormEvent,useId,useState} from "react";
import {
  ChevronDown,
  FileText,
  MessageSquareText,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type Revision = {
  id: string;
  revision_code: string;
  document_id: string;
  documents:
    | { document_number: string; title: string }
    | { document_number: string; title: string }[]
    | null;
};

type Citation = {
  label: number;
  documentId: string;
  revisionId: string;
  documentNumber: string;
  title: string;
  revision: string;
  page: number | null;
  sheet: string | null;
  cellRange: string | null;
  excerpt: string;
};

type Message = {
  question: string;
  answer: string;
  grounded: boolean;
  citations: Citation[];
};

type ProjectChatProps = {
  organisationId: string;
  projectId: string;
  revisions: Revision[];
};

export function ProjectChat({
  organisationId,
  projectId,
  revisions,
}: ProjectChatProps) {
  const id=useId();
  const [selected, setSelected] = useState<string[]>(() =>
    revisions.map((revision) => revision.id),
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(
    revisions.length
      ? `${revisions.length} ready revision${revisions.length === 1 ? " is" : "s are"} selected.`
      : "No ready indexed revisions are available yet.",
  );
  const base = `/app/${organisationId}/projects/${projectId}`;
  const latestCitations = messages.at(-1)?.citations ?? [];

  function toggle(id: string) {
    if (sessionId) return;
    setSelected((value) =>
      value.includes(id)
        ? value.filter((item) => item !== id)
        : [...value, id],
    );
  }

  function selectAll() {
    if (sessionId) return;
    setSelected(revisions.map((revision) => revision.id));
  }

  function clearSelection() {
    if (sessionId) return;
    setSelected([]);
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    // React clears currentTarget after dispatch; keep the form before awaiting.
    const formElement = event.currentTarget;
    const questionField = formElement.elements.namedItem("question") as HTMLTextAreaElement;
    const submittedValue = questionField.value;
    const form = new FormData(formElement);
    const question = String(form.get("question") ?? "").trim();
    if (!question) return;
    if (!selected.length) {
      setNotice("Select at least one ready revision before asking.");
      return;
    }

    setBusy(true);
    setNotice("Retrieving authorised project evidence…");
    try {
      let active = sessionId;
      if (!active) {
        const create = await fetch(
          `/api/v1/organisations/${organisationId}/projects/${projectId}/chat-sessions`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title: question.slice(0, 80),
              revisionIds: selected,
            }),
          },
        );
        const created = await create.json();
        if (!create.ok) {
          throw new Error(created.error?.message ?? "Chat could not be created.");
        }
        active = created.session.id;
        setSessionId(active);
      }

      const response = await fetch(
        `/api/v1/organisations/${organisationId}/projects/${projectId}/chat-sessions/${active}/questions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Question could not be answered.");
      }
      setMessages((value) => [
        ...value,
        {
          question,
          answer: payload.answer,
          grounded: payload.grounded,
          citations: payload.citations,
        },
      ]);
      setNotice(
        payload.grounded
          ? "Answer verified against retrieved project evidence."
          : "Insufficient evidence in the selected revisions.",
      );
      // Do not erase a new question typed while the previous answer was loading.
      if (questionField.value === submittedValue) formElement.reset();
    } catch (error) {
      setNotice(customerErrorMessage(error,"Question failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="engineering-grid relative min-w-0 overflow-hidden rounded-[28px] border border-white/10 bg-[#10243e] text-white shadow-[0_28px_70px_rgba(16,36,62,.24)] [--focus:#ffffff] [&_a:focus-visible]:outline-white [&_button:focus-visible]:outline-white [&_summary:focus-visible]:outline-white [&_input:focus-visible]:outline-white [&_textarea:focus-visible]:outline-white">
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full border-[42px] border-[#ed7138]/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 bottom-16 size-64 rounded-full bg-[#1a3657]/50 blur-3xl" />

      <div className="relative min-w-0 p-4 sm:p-6 lg:p-7 xl:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ed7138]/15 text-[#ff8a55] ring-1 ring-[#ed7138]/25">
              <Sparkles size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">Ask EngiCite</h1>
              <p className="mt-0.5 text-xs text-[#a9bdd4]">
                Know the answer. Cite the proof.
              </p>
            </div>
          </div>
          <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#bed0e2]">
            <ShieldCheck size={14} className="shrink-0 text-[#ff8a55]" aria-hidden="true" /> Project-secured evidence
          </span>
        </header>

        <details className="group mt-5 min-w-0 rounded-2xl border border-white/10 bg-white/[.055] open:bg-white/[.07]">
          <summary className="flex min-h-11 min-w-0 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold marker:content-none">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              Authorised revision scope
              <span className="font-normal text-[#bed0e2]">
                {selected.length} of {revisions.length} selected
              </span>
            </span>
            <ChevronDown
              size={17}
              className="shrink-0 text-[#bed0e2] transition group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>
          <div className="border-t border-white/10 px-4 pb-4 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <HelpTip label="Authorised revision scope">EngiCite can retrieve only the ready revisions selected here. The
                scope locks after your first question.</HelpTip>
              {!sessionId && revisions.length > 0 && (
                <div className="flex flex-wrap gap-2 text-sm font-semibold">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="min-h-11 rounded-lg border border-white/25 px-3 py-2 text-white hover:bg-white/10"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="min-h-11 rounded-lg border border-white/25 px-3 py-2 text-[#bed0e2] hover:bg-white/10 hover:text-white"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            <div role="group" aria-label="Ready revisions" className="mt-3 grid min-w-0 max-h-64 gap-2 overflow-y-auto overscroll-contain p-1 xl:grid-cols-2 2xl:grid-cols-3">
              {revisions.map((revision) => {
                const doc = Array.isArray(revision.documents)
                  ? revision.documents[0]
                  : revision.documents;
                return (
                  <label
                    key={revision.id}
                    className="flex min-h-11 min-w-0 cursor-pointer gap-3 rounded-xl border border-white/20 bg-[#0b1d33]/55 p-3 transition hover:border-[#ed7138]/45 hover:bg-[#152e4c] motion-reduce:transition-none"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(revision.id)}
                      disabled={Boolean(sessionId)}
                      onChange={() => toggle(revision.id)}
                      className="mt-0.5 size-5 shrink-0 accent-[#b94d20]"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold leading-5 text-[#ff8a55] [overflow-wrap:anywhere]">
                        {doc?.document_number} · Rev {revision.revision_code}
                      </span>
                      <span className="mt-1 block text-sm leading-5 text-[#bed0e2] [overflow-wrap:anywhere]">
                        {doc?.title}
                      </span>
                    </span>
                  </label>
                );
              })}
              {!revisions.length && (
                <p className="py-3 text-sm text-[#a9bdd4]">
                  No ready indexed revisions are available.
                </p>
              )}
            </div>
          </div>
        </details>

        <form aria-label="Ask EngiCite" aria-busy={busy} onSubmit={ask} className="mt-5 min-w-0">
          <label htmlFor={`${id}-question`} className="mb-2 block text-sm font-medium text-[#d5e0eb]">
            Ask a question about the selected project evidence
          </label>
          <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-end">
            <textarea
              id={`${id}-question`}
              required
              minLength={2}
              maxLength={1000}
              name="question"
              className="min-h-24 min-w-0 flex-1 resize-y rounded-2xl border border-white/70 bg-white px-4 py-3 text-base text-[#14263d] outline-none shadow-[0_8px_24px_rgba(0,0,0,.14)] placeholder:font-normal placeholder:text-[#617083] focus:border-[#b94d20] focus:ring-4 focus:ring-[#b94d20]/20 sm:text-sm"
              placeholder="What is the export line design pressure?"
            />
            <button
              type="submit"
              disabled={busy || !revisions.length}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#b94d20] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(237,113,56,.15)] transition-colors hover:bg-[#a64019] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none xl:w-auto"
            >
              {busy ? <Sparkles size={18} className="animate-pulse motion-reduce:animate-none" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
              {busy ? "Checking evidence…" : "Ask EngiCite"}
            </button>
          </div>
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="mt-2 flex min-w-0 items-start gap-2 text-xs leading-5 text-[#bed0e2]"
          >
            <MessageSquareText size={13} className="mt-1 shrink-0" aria-hidden="true" /><span className="min-w-0 [overflow-wrap:anywhere]">{notice}</span>
          </p>
        </form>

        <div className="mt-4 min-w-0 space-y-4" role="log" aria-label="Questions and answers" aria-live="polite" aria-relevant="additions">
          {messages.map((message, index) => (
            <article
              key={`${message.question}-${index}`}
              aria-label={`Question ${index+1} and answer`}
              className="min-w-0 rounded-2xl border border-white/10 bg-white/[.065] p-3 sm:p-5"
            >
              <p className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#14263d] [overflow-wrap:anywhere]">
                {message.question}
              </p>
              <div className="mt-3 min-w-0 rounded-xl bg-[#173452] p-3 sm:p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-[#ff8a55]">
                  <ShieldCheck size={15} aria-hidden="true" />
                  {message.grounded ? "Cited answer" : "Insufficient evidence"}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#d5e0eb] [overflow-wrap:anywhere]">
                  {message.answer}
                </p>
                {message.citations.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {message.citations.map((citation) => (
                      <Link
                        key={citation.label}
                        href={citationHref(base, citation)}
                        aria-label={`Open cited source ${citation.label}: ${citation.documentNumber}, revision ${citation.revision}, ${locationLabel(citation)}`}
                        className="inline-flex min-h-11 max-w-full items-center rounded-lg bg-[#294563] px-3 py-2 text-xs font-semibold leading-5 text-white transition-colors [overflow-wrap:anywhere] hover:bg-[#365777] first:bg-[#b94d20] first:hover:bg-[#a64019] motion-reduce:transition-none"
                      >
                        {citation.documentNumber} · Rev {citation.revision} · {locationLabel(citation)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>

        {latestCitations.length > 0 && (
          <section className="mt-5 min-w-0 space-y-2" aria-label="Sources for the latest answer">
            {latestCitations.map((citation) => (
              <Link
                key={`${citation.revisionId}-${citation.label}`}
                href={citationHref(base, citation)}
                className="group flex min-h-11 min-w-0 items-start gap-3 rounded-xl border border-white/20 bg-[#0b1d33]/70 p-3 transition-colors hover:border-[#ed7138]/40 hover:bg-[#142d4a] motion-reduce:transition-none"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/10 text-white">
                  <FileText size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-xs font-semibold leading-5"><span className="min-w-0 text-[#ff8a55] [overflow-wrap:anywhere]">{citation.documentNumber}</span><span className="max-w-full text-[#bed0e2] [overflow-wrap:anywhere]">Rev {citation.revision}</span></span>
                  <span className="mt-0.5 block text-sm leading-5 text-white [overflow-wrap:anywhere]">
                    {citation.title || citation.excerpt}
                  </span>
                </span>
              </Link>
            ))}
          </section>
        )}
      </div>

      <footer className="relative border-t border-white/10 px-4 py-3 text-center text-xs leading-5 text-[#a9bdd4] sm:px-6">
        Authorised project data · EngiCite evidence workflow
      </footer>
    </div>
  );
}

function citationHref(base: string, citation: Citation) {
  return `${base}/documents/${citation.documentId}/revisions/${citation.revisionId}/preview${citation.page ? `#page=${citation.page}` : ""}`;
}

function locationLabel(citation: Citation) {
  if (citation.page) return `Page ${citation.page}`;
  return `${citation.sheet ?? "Sheet"} ${citation.cellRange ?? ""}`.trim();
}
