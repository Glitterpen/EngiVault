"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
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
    const form = new FormData(event.currentTarget);
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
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Question failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="engineering-grid relative overflow-hidden rounded-[28px] border border-white/10 bg-[#10243e] text-white shadow-[0_28px_70px_rgba(16,36,62,.24)]">
      <div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full border-[42px] border-[#ed7138]/10" />
      <div className="pointer-events-none absolute -left-32 bottom-16 size-64 rounded-full bg-[#1a3657]/50 blur-3xl" />

      <div className="relative p-5 sm:p-7 lg:p-9">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#ed7138]/15 text-[#ff8a55] ring-1 ring-[#ed7138]/25">
              <Sparkles size={20} />
            </span>
            <div>
              <p className="text-lg font-bold tracking-[-.02em]">Ask EngiCite</p>
              <p className="mt-0.5 text-xs text-[#a9bdd4]">
                Know the answer. Cite the proof.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#bed0e2]">
            <ShieldCheck size={14} className="text-[#ff8a55]" /> Project-secured evidence
          </span>
        </header>

        <details className="group mt-6 rounded-2xl border border-white/10 bg-white/[.055] open:bg-white/[.07]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold marker:content-none">
            <span>
              Authorised revision scope
              <span className="ml-2 font-normal text-[#9fb4ca]">
                {selected.length} of {revisions.length} selected
              </span>
            </span>
            <ChevronDown
              size={17}
              className="text-[#9fb4ca] transition group-open:rotate-180"
            />
          </summary>
          <div className="border-t border-white/10 px-4 pb-4 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-2xl text-xs leading-5 text-[#a9bdd4]">
                EngiCite can retrieve only the ready revisions selected here. The
                scope locks after your first question.
              </p>
              {!sessionId && revisions.length > 0 && (
                <div className="flex gap-2 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-white hover:bg-white/10"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-[#a9bdd4] hover:bg-white/10 hover:text-white"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
              {revisions.map((revision) => {
                const doc = Array.isArray(revision.documents)
                  ? revision.documents[0]
                  : revision.documents;
                return (
                  <label
                    key={revision.id}
                    className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-[#0b1d33]/55 p-3 transition hover:border-[#ed7138]/45 hover:bg-[#152e4c]"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(revision.id)}
                      disabled={Boolean(sessionId)}
                      onChange={() => toggle(revision.id)}
                      className="mt-0.5 size-4 accent-[#ed7138]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-[#ff8a55]">
                        {doc?.document_number} · Rev {revision.revision_code}
                      </span>
                      <span className="mt-1 block truncate text-xs text-[#a9bdd4]">
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

        <form onSubmit={ask} className="mt-5">
          <label htmlFor="engicite-question" className="sr-only">
            Ask a question about the selected project evidence
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <textarea
              id="engicite-question"
              required
              minLength={2}
              maxLength={1000}
              name="question"
              className="min-h-16 flex-1 resize-y rounded-2xl border border-white/70 bg-white px-4 py-4 text-sm font-semibold text-[#14263d] outline-none shadow-[0_8px_24px_rgba(0,0,0,.14)] placeholder:font-normal placeholder:text-[#77869a] focus:border-[#ed7138] focus:ring-4 focus:ring-[#ed7138]/20"
              placeholder="What is the export line design pressure?"
            />
            <button
              type="submit"
              disabled={busy || !revisions.length}
              className="inline-flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-[#ed7138] px-6 text-sm font-bold text-white shadow-[0_10px_24px_rgba(237,113,56,.25)] transition hover:-translate-y-0.5 hover:bg-[#ff7c40] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Sparkles size={18} className="animate-pulse" /> : <Send size={17} />}
              {busy ? "Checking evidence…" : "Ask EngiCite"}
            </button>
          </div>
          <p
            role="status"
            className="mt-2 flex items-center gap-2 text-xs text-[#9fb4ca]"
          >
            <MessageSquareText size={13} /> {notice}
          </p>
        </form>

        <div className="mt-4 space-y-4" aria-live="polite">
          {messages.map((message, index) => (
            <article
              key={`${message.question}-${index}`}
              className="rounded-2xl border border-white/10 bg-white/[.065] p-4 sm:p-5"
            >
              <p className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#14263d]">
                {message.question}
              </p>
              <div className="mt-3 rounded-xl bg-[#173452] p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-[#ff8a55]">
                  <ShieldCheck size={15} />
                  {message.grounded ? "Cited answer" : "Insufficient evidence"}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#d5e0eb]">
                  {message.answer}
                </p>
                {message.citations.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {message.citations.map((citation) => (
                      <Link
                        key={citation.label}
                        href={citationHref(base, citation)}
                        className="inline-flex rounded-lg bg-[#294563] px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white transition hover:bg-[#365777] first:bg-[#ed7138] first:hover:bg-[#ff7c40]"
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
          <section className="mt-5 space-y-2" aria-label="Sources for the latest answer">
            {latestCitations.map((citation) => (
              <Link
                key={`${citation.revisionId}-${citation.label}`}
                href={citationHref(base, citation)}
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-[#0b1d33]/70 p-3 transition hover:border-[#ed7138]/40 hover:bg-[#142d4a]"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/10 text-white">
                  <FileText size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-extrabold uppercase tracking-wide text-[#ff8a55]">
                    {citation.documentNumber}
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-semibold text-white">
                    {citation.title || citation.excerpt}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] font-bold uppercase text-[#91abc5] group-hover:text-white">
                  Rev {citation.revision}
                </span>
              </Link>
            ))}
          </section>
        )}
      </div>

      <footer className="relative border-t border-white/10 px-5 py-3 text-center text-[9px] font-bold uppercase tracking-[.18em] text-[#6685a5] sm:px-9">
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
