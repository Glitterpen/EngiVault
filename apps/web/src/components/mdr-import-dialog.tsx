"use client";
import {HelpTip} from "@/components/help-tip";
import { customerErrorMessage, supportReference } from "@/lib/customer-messages";


import { useId, useRef, useState } from "react";
import { Download, FileCheck2, FileSpreadsheet, Upload, X } from "lucide-react";

type PreviewRow = {
  row_number: number;
  document_number?: string;
  title?: string;
  discipline?: string;
  document_type?: string;
  planned_submission_date?: string;
  errors: string[];
  is_valid: boolean;
  [key: string]: unknown;
};

type Preview = {
  sheetName: string;
  rowCount: number;
  validCount: number;
  errorCount: number;
  canImport: boolean;
  rows: PreviewRow[];
};

const PREVIEW_PAGE_SIZE = 15;

export function MdrImportDialog({ organisationId, projectId }: { organisationId: string; projectId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [operation, setOperation] = useState<"preview" | "import" | null>(null);
  const [rowView, setRowView] = useState<"all" | "errors">("all");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const busy = operation !== null;
  const rows = preview?.rows.filter(row => rowView === "all" || !row.is_valid) ?? [];
  const pageCount = Math.max(1, Math.ceil(rows.length / PREVIEW_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PREVIEW_PAGE_SIZE;
  const visibleRows = rows.slice(pageStart, pageStart + PREVIEW_PAGE_SIZE);
  const endpoint = `/api/v1/organisations/${organisationId}/projects/${projectId}/documents/import`;

  async function previewWorkbook() {
    if (busy) return;
    if (!file) return setMessage("Choose an Excel .xlsx file first.");
    setOperation("preview");
    setFailed(false);
    setMessage("");
    setPreview(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(endpoint, { method: "POST", body: form });
      const body = await response.json() as Preview & { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The workbook could not be previewed.");
      setPreview(body);
      setRowView(body.rows.some(row => !row.is_valid) ? "errors" : "all");
      setPage(1);
      setMessage(body.canImport ? "All rows passed validation and are ready to import." : "Correct the rows that need correction in Excel, save the file and preview it again.");
    } catch (error) {
      setFailed(true);
      setMessage(customerErrorMessage(error,"The workbook could not be previewed."));
    } finally {
      setOperation(null);
    }
  }

  async function importWorkbook() {
    if (busy || !preview?.canImport) return;
    setOperation("import");
    setFailed(false);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: preview.rows }),
      });
      const body = await response.json() as { created_count?: number; error?: { message?: string; reference?: string } };
      if (!response.ok) throw new Error(`${body.error?.message ?? "The MDR could not be imported."}${body.error?.reference ? ` Reference: ${supportReference(body.error.reference)}.` : ""}`);
      setMessage(`${body.created_count ?? preview.rowCount} documents were added to the MDR.`);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setFailed(true);
      setMessage(customerErrorMessage(error,"The MDR could not be imported."));
      setOperation(null);
    }
  }

  function chooseFile(next: File | null) {
    setFile(next);
    setPreview(null);
    setRowView("all");
    setPage(1);
    setFailed(false);
    setMessage(next ? `${next.name} selected. Preview it before importing.` : "");
  }

  return <>
    <button type="button" onClick={() => dialog.current?.showModal()} className="ev-button-secondary inline-flex items-center gap-2 px-4">
      <FileSpreadsheet size={16} /> Import Excel
    </button>
    <dialog ref={dialog} aria-label="Import Master Document Register from Excel" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }} className="m-auto max-h-[94vh] w-[min(96vw,1050px)] overflow-hidden rounded-2xl border border-[#dce2e9] bg-white p-0 text-[#10243e] shadow-[0_28px_90px_rgba(16,36,62,.32)] backdrop:bg-[#10243e]/65 backdrop:backdrop-blur-sm">
      <header className="flex items-center justify-between gap-3 border-b border-[#d6e0ed] px-5 py-4 sm:px-6">
        <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#a64019]">Master document register</p><h2 className="mt-1 font-semibold">Import planned deliverables from Excel</h2></div>
        <button type="button" onClick={() => dialog.current?.close()} className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#dce2e9] text-[#617083] hover:border-[#a64019] hover:text-[#a64019]" aria-label="Close Excel import"><X size={16} aria-hidden="true"/></button>
      </header>
      <div className="max-h-[calc(94vh-73px)] overflow-y-auto p-5 sm:p-6">
        <section className="grid gap-3 md:grid-cols-3">
          <Step number="1" title="Download template" body="Use the controlled headings and date format.">
            <a href="/templates/EngiCite-MDR-Import-Template.xlsx" download className="ev-button-secondary mt-4 w-full"><Download size={16} /> Download Excel template</a>
          </Step>
          <Step number="2" title="Choose workbook" body="Excel .xlsx only, up to 5 MB and 500 rows.">
            <label htmlFor={inputId} className="ev-file-picker ev-button-secondary mt-4 w-full cursor-pointer"><Upload size={16} aria-hidden="true"/> Choose Excel file
              <input id={inputId} className="sr-only" type="file" aria-describedby={`${inputId}-selection`} disabled={busy} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
            </label>
            <p id={`${inputId}-selection`} aria-live="polite" className="mt-2 text-xs font-semibold text-[#10243e] [overflow-wrap:anywhere]">{file?.name ?? "No file selected"}</p>
          </Step>
          <Step number="3" title="Preview and import" body="Nothing is saved until every row passes validation.">
            <button type="button" className="ev-button mt-4 w-full" disabled={busy || !file} onClick={previewWorkbook}><FileCheck2 size={16} /> {operation === "preview" ? "Checking workbook..." : "Preview workbook"}</button>
          </Step>
        </section>

        <HelpTip label="Excel MDR import rules">Document type is flexible: use a suggested name/code or enter your own type (up to 80 characters).
          New discipline names are accepted and added to this project when the import succeeds. Check spellings in the preview; the Project Manager can also add disciplines in Project team &amp; resources.
          Numbers from Removed deliverables can be reused; active MDR numbers must remain unique.</HelpTip>

        {preview && <section className="mt-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Rows found" value={preview.rowCount} />
            <Summary label="Ready" value={preview.validCount} good />
            <Summary label="Need correction" value={preview.errorCount} warning={preview.errorCount > 0} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Workbook preview rows">
            <button type="button" className="ev-button-secondary" aria-pressed={rowView === "all"} onClick={() => { setRowView("all"); setPage(1); }}>All rows ({preview.rows.length})</button>
            <button type="button" className="ev-button-secondary" aria-pressed={rowView === "errors"} onClick={() => { setRowView("errors"); setPage(1); }}>Need correction ({preview.rows.filter(row => !row.is_valid).length})</button>
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-[#d6e0ed]" role="region" aria-label="Workbook validation preview" tabIndex={0}>
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-[#f4f7fb] text-[10px] uppercase tracking-[.12em] text-[#617083]"><tr><th className="p-3">Excel row</th><th>Document</th><th>Title</th><th>Discipline</th><th>Type</th><th>Submission</th><th>Validation</th></tr></thead>
              <tbody>{visibleRows.map((row) => <tr key={row.row_number} className="border-t border-[#d6e0ed] align-top"><td className="p-3 font-bold">{row.row_number}</td><td className="max-w-44 p-3 font-semibold text-[#10243e]">{row.document_number ?? "-"}</td><td className="max-w-60 p-3">{row.title ?? "-"}</td><td className="p-3">{row.discipline ?? "-"}</td><td className="p-3">{row.document_type ?? "-"}</td><td className="p-3">{row.planned_submission_date ?? "-"}</td><td className={`max-w-72 p-3 ${row.is_valid ? "font-semibold text-[#10243e]" : "text-[#a5452f]"}`}>{row.is_valid ? "Ready" : row.errors.join(" ")}</td></tr>)}</tbody>
            </table>
            {!rows.length && <p className="p-4 text-sm text-[#617083]">No rows need correction.</p>}
          </div>
          <nav className="mt-3 flex flex-wrap items-center justify-between gap-3" aria-label="Workbook preview pages">
            <p className="text-xs text-[#617083]" role="status">{rows.length ? `Showing ${pageStart + 1}–${pageStart + visibleRows.length} of ${rows.length} rows · Page ${currentPage} of ${pageCount}` : "0 rows"}</p>
            {pageCount > 1 && <div className="flex gap-2"><button type="button" className="ev-button-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous rows</button><button type="button" className="ev-button-secondary" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next rows</button></div>}
          </nav>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f4f7fb] p-4">
            <p role={failed ? "alert" : "status"} className={`text-sm ${preview.canImport && !failed ? "font-semibold text-[#10243e]" : "text-[#a5452f]"}`}>{message}</p>
            <button type="button" className="ev-button" disabled={busy || !preview.canImport} onClick={importWorkbook}><Upload size={16} /> {operation === "import" ? "Importing..." : `Import ${preview.validCount} documents`}</button>
          </div>
        </section>}
        {!preview && message && <p className="mt-4 rounded-xl border border-[#d6e0ed] bg-[#f4f7fb] p-4 text-sm text-[#617083]" role={failed ? "alert" : "status"}>{message}</p>}
      </div>
    </dialog>
  </>;
}

function Step({ number, title, body, children }: { number: string; title: string; body: string; children: React.ReactNode }) {
  return <article className="min-w-0 rounded-xl border border-[#d6e0ed] p-4"><div className="flex min-w-0 items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#10243e] text-xs font-bold text-white">{number}</span><h3 className="min-w-0 font-semibold">{title} <HelpTip label={`${title} guidance`}>{body}</HelpTip></h3></div>{children}</article>;
}

function Summary({ label, value, good = false, warning = false }: { label: string; value: number; good?: boolean; warning?: boolean }) {
  return <div className={`rounded-xl border p-4 ${warning ? "border-[#f0c8b7] bg-[#fff6f2]" : good ? "border-[#d6e0ed] bg-[#eef3fa]" : "border-[#d6e0ed] bg-white"}`}><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#617083]">{label}</p><p className={`mt-1 text-2xl font-semibold ${warning ? "text-[#a5452f]" : good ? "text-[#10243e]" : ""}`}>{value}</p></div>;
}
