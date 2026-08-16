"use client";

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

export function MdrImportDialog({ organisationId, projectId }: { organisationId: string; projectId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const endpoint = `/api/v1/organisations/${organisationId}/projects/${projectId}/documents/import`;

  async function previewWorkbook() {
    if (!file) return setMessage("Choose an Excel .xlsx file first.");
    setBusy(true);
    setMessage("");
    setPreview(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(endpoint, { method: "POST", body: form });
      const body = await response.json() as Preview & { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The workbook could not be previewed.");
      setPreview(body);
      setMessage(body.canImport ? "All rows passed validation and are ready to import." : "Correct the highlighted rows in Excel, save the file and preview it again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The workbook could not be previewed.");
    } finally {
      setBusy(false);
    }
  }

  async function importWorkbook() {
    if (!preview?.canImport) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: preview.rows }),
      });
      const body = await response.json() as { created_count?: number; error?: { message?: string; reference?: string } };
      if (!response.ok) throw new Error(`${body.error?.message ?? "The MDR could not be imported."}${body.error?.reference ? ` Reference: ${body.error.reference}.` : ""}`);
      setMessage(`${body.created_count ?? preview.rowCount} documents were added to the MDR.`);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The MDR could not be imported.");
      setBusy(false);
    }
  }

  function chooseFile(next: File | null) {
    setFile(next);
    setPreview(null);
    setMessage(next ? `${next.name} selected. Preview it before importing.` : "");
  }

  return <>
    <button type="button" onClick={() => dialog.current?.showModal()} className="ev-button-secondary inline-flex items-center gap-2 px-4">
      <FileSpreadsheet size={16} /> Import Excel
    </button>
    <dialog ref={dialog} aria-label="Import Master Document Register from Excel" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }} className="m-auto max-h-[94vh] w-[min(96vw,1050px)] overflow-hidden rounded-2xl border border-[#dce2e9] bg-white p-0 text-[#10243e] shadow-[0_28px_90px_rgba(16,36,62,.32)] backdrop:bg-[#10243e]/65 backdrop:backdrop-blur-sm">
      <header className="flex items-center justify-between border-b border-[#dfe7e3] px-5 py-4 sm:px-6">
        <div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#e8733f]">Master document register</p><h2 className="mt-1 font-semibold">Import planned deliverables from Excel</h2></div>
        <button type="button" onClick={() => dialog.current?.close()} className="grid size-9 place-items-center rounded-lg border border-[#dce2e9] text-[#617083] hover:border-[#e8733f] hover:text-[#e8733f]" aria-label="Close Excel import"><X size={16} /></button>
      </header>
      <div className="max-h-[calc(94vh-73px)] overflow-y-auto p-5 sm:p-6">
        <section className="grid gap-3 md:grid-cols-3">
          <Step number="1" title="Download template" body="Use the controlled headings and date format.">
            <a href="/templates/EngiCite-MDR-Import-Template.xlsx" download className="ev-button-secondary mt-4 w-full"><Download size={16} /> Download Excel template</a>
          </Step>
          <Step number="2" title="Choose workbook" body="Excel .xlsx only, up to 5 MB and 500 rows.">
            <label htmlFor={inputId} className="ev-button-secondary mt-4 w-full cursor-pointer"><Upload size={16} /> Choose Excel file</label>
            <input id={inputId} className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
            <p className="mt-2 truncate text-xs font-semibold text-[#0c5b45]">{file?.name ?? "No file selected"}</p>
          </Step>
          <Step number="3" title="Preview and import" body="Nothing is saved until every row passes validation.">
            <button type="button" className="ev-button mt-4 w-full" disabled={busy || !file} onClick={previewWorkbook}><FileCheck2 size={16} /> {busy ? "Checking workbook..." : "Preview workbook"}</button>
          </Step>
        </section>

        {preview && <section className="mt-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Rows found" value={preview.rowCount} />
            <Summary label="Ready" value={preview.validCount} good />
            <Summary label="Need correction" value={preview.errorCount} warning={preview.errorCount > 0} />
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-[#dfe7e3]">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-[#f8faf8] text-[10px] uppercase tracking-[.12em] text-[#617083]"><tr><th className="p-3">Excel row</th><th>Document</th><th>Title</th><th>Discipline</th><th>Type</th><th>Submission</th><th>Validation</th></tr></thead>
              <tbody>{preview.rows.slice(0, 15).map((row) => <tr key={row.row_number} className="border-t border-[#edf1ef] align-top"><td className="p-3 font-bold">{row.row_number}</td><td className="max-w-44 p-3 font-semibold text-[#0c5b45]">{row.document_number ?? "-"}</td><td className="max-w-60 p-3">{row.title ?? "-"}</td><td className="p-3">{row.discipline ?? "-"}</td><td className="p-3">{row.document_type ?? "-"}</td><td className="p-3">{row.planned_submission_date ?? "-"}</td><td className={`max-w-72 p-3 ${row.is_valid ? "font-semibold text-[#0c5b45]" : "text-[#a5452f]"}`}>{row.is_valid ? "Ready" : row.errors.join(" ")}</td></tr>)}</tbody>
            </table>
          </div>
          {preview.rows.length > 15 && <p className="mt-2 text-xs text-[#617083]">Showing the first 15 of {preview.rows.length} rows.</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f7f9f8] p-4">
            <p className={`text-sm ${preview.canImport ? "font-semibold text-[#0c5b45]" : "text-[#a5452f]"}`}>{message}</p>
            <button type="button" className="ev-button" disabled={busy || !preview.canImport} onClick={importWorkbook}><Upload size={16} /> {busy ? "Importing..." : `Import ${preview.validCount} documents`}</button>
          </div>
        </section>}
        {!preview && message && <p className="mt-4 rounded-xl border border-[#dfe7e3] bg-[#f8faf8] p-4 text-sm text-[#617083]" role="status">{message}</p>}
      </div>
    </dialog>
  </>;
}

function Step({ number, title, body, children }: { number: string; title: string; body: string; children: React.ReactNode }) {
  return <article className="rounded-xl border border-[#dfe7e3] p-4"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-[#10243e] text-xs font-bold text-white">{number}</span><h3 className="font-semibold">{title}</h3></div><p className="mt-3 text-xs leading-5 text-[#617083]">{body}</p>{children}</article>;
}

function Summary({ label, value, good = false, warning = false }: { label: string; value: number; good?: boolean; warning?: boolean }) {
  return <div className={`rounded-xl border p-4 ${warning ? "border-[#f0c8b7] bg-[#fff6f2]" : good ? "border-[#cce2d7] bg-[#f1f7f4]" : "border-[#dfe7e3] bg-white"}`}><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#617083]">{label}</p><p className={`mt-1 text-2xl font-semibold ${warning ? "text-[#a5452f]" : good ? "text-[#0c5b45]" : ""}`}>{value}</p></div>;
}
