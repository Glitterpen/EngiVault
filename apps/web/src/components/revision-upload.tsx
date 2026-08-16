"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { IssueStatusSelect } from "@/components/issue-status-select";
import {
  canonicalUploadMime,
  hasExpectedMime,
  hasSupportedSignature,
  MAX_UPLOAD_BYTES,
} from "@/lib/file-validation";
import { createClient } from "@/lib/supabase/browser";

export function RevisionUpload({
  organisationId,
  projectId,
  documentId,
}: {
  organisationId: string;
  projectId: string;
  documentId: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [failed, setFailed] = useState(false);

  async function submit(formData: FormData, file: File) {
    setBusy(true);
    setFailed(false);
    setProgress(10);
    setStatus("Validating file…");
    try {
      const mime = canonicalUploadMime(file.name, file.type);
      if (!mime || !hasExpectedMime(file.name, mime) || file.size > MAX_UPLOAD_BYTES) {
        throw new Error("Choose a PDF, DOCX, XLSX or DWG file up to 250 MB.");
      }
      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (!hasSupportedSignature(file.name, header)) {
        throw new Error("The file contents do not match the selected engineering file type.");
      }
      setProgress(25);
      setStatus("Calculating file checksum…");
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const response = await fetch(
        `/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/upload-session`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            revisionCode: formData.get("revisionCode"),
            issueStatus: formData.get("issueStatus"),
            issueDate: formData.get("issueDate") || undefined,
            fileName: file.name,
            mimeType: mime,
            size: file.size,
            sha256,
          }),
        },
      );
      if (response.redirected && new URL(response.url).pathname === "/login") {
        throw new Error("Your session expired before the upload started. Sign in again, then retry this upload.");
      }
      const session = await response.json();
      if (!response.ok) throw new Error(session.error?.message ?? "Upload session failed.");
      setProgress(50);
      setStatus("Uploading to private storage…");
      const { error } = await createClient()
        .storage.from("documents")
        .uploadToSignedUrl(session.path, session.token, file, { contentType: mime, upsert: false });
      if (error) throw error;
      setProgress(85);
      setStatus("Moving file into secure quarantine…");
      const completed = await fetch(
        `/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${session.revisionId}/complete`,
        { method: "POST" },
      );
      if (completed.redirected && new URL(completed.url).pathname === "/login") {
        throw new Error("The file reached secure storage, but your session expired before it could be registered. Sign in again and retry.");
      }
      const completion = await completed.json();
      if (!completed.ok) throw new Error(completion.error?.message ?? "Upload completion failed.");
      setProgress(100);
      setStatus("Upload complete. The revision is queued for secure processing.");
      router.refresh();
    } catch (error) {
      setFailed(true);
      setProgress(0);
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function startUpload(form: HTMLFormElement | null) {
    if (!selectedFile) {
      setFailed(true);
      setStatus("Choose a file before starting the secure upload.");
      return;
    }
    if (!form) return;
    const formData = new FormData(form);
    if (!String(formData.get("revisionCode") ?? "").trim()) {
      const revisionInput = form.elements.namedItem("revisionCode");
      setFailed(true);
      setStatus("Enter the revision code, for example R01.");
      if (revisionInput instanceof HTMLElement) revisionInput.focus();
      return;
    }
    if (!String(formData.get("issueStatus") ?? "").trim()) {
      const statusInput = form.elements.namedItem("issueStatus");
      setFailed(true);
      setStatus("Select the purpose for which this revision is being issued.");
      if (statusInput instanceof HTMLElement) statusInput.focus();
      return;
    }
    void submit(formData, selectedFile);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        startUpload(event.currentTarget);
      }}
      className="ev-card p-6"
    >
      <div className="flex items-center gap-2">
        <UploadCloud size={18} className="text-[#e8733f]" />
        <h2 className="font-semibold">Upload revision</h2>
      </div>
      <Field name="revisionCode" label="Revision" placeholder="C02" disabled={busy} />
      <IssueStatusSelect name="issueStatus" disabled={busy} />
      <label className="mt-4 block">
        <span className="ev-label">Issue date</span>
        <input className="ev-input" name="issueDate" type="date" disabled={busy} />
      </label>
      <label className="mt-4 block">
        <span className="ev-label">File</span>
        <input
          className="block w-full cursor-pointer rounded-lg border border-dashed border-[#ced6df] bg-white p-3 text-sm text-[#617083] file:mr-4 file:cursor-pointer file:rounded-lg file:border file:border-[#ced6df] file:bg-white file:px-4 file:py-2 file:text-sm file:font-bold file:text-[#10243e] hover:file:bg-[#f4f6f8]"
          name="file"
          type="file"
          accept=".pdf,.docx,.xlsx,.dwg"
          required
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.item(0) ?? null;
            setSelectedFile(file);
            setStatus(file ? `${file.name} is ready to upload.` : "");
            setFailed(false);
          }}
        />
      </label>
      <p className="mt-2 text-xs text-[#617083]">PDF, DOCX, XLSX or DWG · maximum 250 MB</p>
      <button
        type="button"
        className="ev-button mt-5 w-full"
        disabled={busy}
        onClick={(event) => startUpload(event.currentTarget.form)}
      >
        {busy ? "Working…" : "Start secure upload"}
      </button>
      {(busy || progress === 100) && (
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-[#e5ebe8]"
          aria-label={`Upload progress ${progress}%`}
        >
          <div
            className="h-full rounded-full bg-[#e8733f] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {status && (
        <p
          className={`mt-3 rounded-lg p-3 text-xs leading-5 ${
            failed
              ? "border border-[#f0c8b7] bg-[#fff6f2] text-[#8b3d1f]"
              : "bg-[#eef4f1] text-[#0c5b45]"
          }`}
          role={failed ? "alert" : "status"}
        >
          {status}
        </p>
      )}
    </form>
  );
}

function Field({
  name,
  label,
  placeholder,
  disabled,
}: {
  name: string;
  label: string;
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <label className="mt-4 block">
      <span className="ev-label">{label}</span>
      <input
        className="ev-input"
        name={name}
        placeholder={placeholder}
        required
        disabled={disabled}
      />
    </label>
  );
}
