"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileCog, UploadCloud } from "lucide-react";
import { IssueStatusSelect } from "@/components/issue-status-select";
import {
  projectDeliveryStage,
  projectDeliveryStageLabel,
  projectTerminalIssueStatus,
  type ProjectDeliveryStage,
} from "@/lib/project-delivery-stage";
import {
  canonicalUploadMime,
  hasExpectedMime,
  hasSupportedSignature,
  isNativeEngineeringFile,
  MAX_UPLOAD_BYTES,
} from "@/lib/file-validation";
import { requiresNativeCompanion } from "@/lib/native-file-requirement";
import {
  blockedIssueStatuses,
  ISSUE_FOR_APPROVAL,
  ISSUE_FOR_REVIEW,
} from "@/lib/document-issue-sequence";
import { createClient } from "@/lib/supabase/browser";

type PreparedFile = {
  file: File;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
};

type UploadSession = {
  revisionId: string;
  path: string;
  token: string;
  native?: { path: string; token: string };
};

export function RevisionUpload({
  organisationId,
  projectId,
  documentId,
  deliveryStage,
  completedIssueStatuses,
}: {
  organisationId: string;
  projectId: string;
  documentId: string;
  deliveryStage: ProjectDeliveryStage;
  completedIssueStatuses: string[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [nativeFile, setNativeFile] = useState<File | null>(null);
  const [issueStatus, setIssueStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const nativeRequired = requiresNativeCompanion(deliveryStage, issueStatus, selectedFile?.name);
  const unavailableIssueStatuses = blockedIssueStatuses(completedIssueStatuses);
  const hasSubmittedIfr = completedIssueStatuses.includes(ISSUE_FOR_REVIEW);
  const hasSubmittedIfa = completedIssueStatuses.includes(ISSUE_FOR_APPROVAL);

  async function submit(formData: FormData, file: File, companion: File | null) {
    setBusy(true);
    setFailed(false);
    setProgress(8);
    setStatus("Validating controlled files...");
    try {
      const preparedPrimary = await prepareFile(file, false);
      const preparedNative = companion ? await prepareFile(companion, true) : null;
      if (requiresNativeCompanion(deliveryStage, String(formData.get("issueStatus") ?? ""), file.name) && !preparedNative) {
        throw new Error(`Attach the editable native source before submitting ${projectTerminalIssueStatus(deliveryStage)}.`);
      }

      setProgress(25);
      setStatus(preparedNative ? "Calculating checksums for both files..." : "Calculating file checksum...");
      const response = await fetch(
        `/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/upload-session`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            revisionCode: formData.get("revisionCode"),
            issueStatus: formData.get("issueStatus"),
            issueDate: formData.get("issueDate") || undefined,
            fileName: preparedPrimary.fileName,
            mimeType: preparedPrimary.mimeType,
            size: preparedPrimary.size,
            sha256: preparedPrimary.sha256,
            nativeFile: preparedNative
              ? {
                  fileName: preparedNative.fileName,
                  mimeType: preparedNative.mimeType,
                  size: preparedNative.size,
                  sha256: preparedNative.sha256,
                }
              : undefined,
          }),
        },
      );
      if (response.redirected && new URL(response.url).pathname === "/login") {
        throw new Error("Your session expired before the upload started. Sign in again, then retry this upload.");
      }
      const session = (await response.json()) as UploadSession & { error?: { message?: string } };
      if (!response.ok) throw new Error(session.error?.message ?? "Upload session failed.");

      const storage = createClient().storage.from("documents");
      setProgress(45);
      setStatus("Uploading the controlled issue file to private storage...");
      const { error } = await storage.uploadToSignedUrl(session.path, session.token, file, {
        contentType: preparedPrimary.mimeType,
        upsert: false,
      });
      if (error) throw error;

      if (preparedNative) {
        if (!session.native) throw new Error("The native-source upload link is unavailable. Start the upload again.");
        setProgress(68);
        setStatus("Uploading the editable native source to private storage...");
        const { error: nativeError } = await storage.uploadToSignedUrl(
          session.native.path,
          session.native.token,
          preparedNative.file,
          { contentType: preparedNative.mimeType, upsert: false },
        );
        if (nativeError) throw nativeError;
      }

      setProgress(88);
      setStatus("Moving the complete revision into secure quarantine...");
      const completed = await fetch(
        `/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/${session.revisionId}/complete`,
        { method: "POST" },
      );
      if (completed.redirected && new URL(completed.url).pathname === "/login") {
        throw new Error("The files reached secure storage, but your session expired before they could be registered. Sign in again and retry.");
      }
      const completion = await completed.json();
      if (!completed.ok) throw new Error(completion.error?.message ?? "Upload completion failed.");
      setProgress(100);
      setStatus(preparedNative
        ? "Upload complete. The PDF and native source are queued for security processing."
        : "Upload complete. The revision is queued for secure processing.");
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
    if (nativeRequired && !nativeFile) {
      const nativeInput = form.elements.namedItem("nativeFile");
      setFailed(true);
      setStatus(`Attach the editable DWG, DOCX or XLSX source required for ${projectTerminalIssueStatus(deliveryStage)}.`);
      if (nativeInput instanceof HTMLElement) nativeInput.focus();
      return;
    }
    void submit(formData, selectedFile, nativeRequired ? nativeFile : null);
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
      <div className="mt-4 rounded-xl border border-[#dfe7e3] bg-[#f7faf8] p-3 text-xs leading-5 text-[#617083]">
        <strong className="text-[#0c5b45]">{projectDeliveryStageLabel(deliveryStage)} workflow:</strong>{" "}
        {projectDeliveryStage(deliveryStage)?.workflow}. DCC-accepted progress reaches 100% at {projectTerminalIssueStatus(deliveryStage)}.
      </div>
      <Field name="revisionCode" label="Revision" placeholder="C02" disabled={busy} />
      <IssueStatusSelect
        name="issueStatus"
        disabled={busy}
        disabledValues={unavailableIssueStatuses}
        onChange={(event) => {
          setIssueStatus(event.currentTarget.value);
          setFailed(false);
          setStatus("");
        }}
      />
      {(!hasSubmittedIfr || !hasSubmittedIfa) && (
        <div className="mt-3 rounded-xl border border-[#e2e7e4] bg-[#fafbf9] p-3 text-xs leading-5 text-[#617083]">
          <strong className="text-[#0c5b45]">Controlled issue sequence:</strong>{" "}
          IFR must complete secure submission before IFA becomes available. IFA must then complete secure submission before IFD or IFC becomes available.
          {!hasSubmittedIfr
            ? " Submit IFR first for this document."
            : !hasSubmittedIfa
              ? " IFR is complete; submit IFA next."
              : ""}
        </div>
      )}
      <label className="mt-4 block">
        <span className="ev-label">Issue date</span>
        <input className="ev-input" name="issueDate" type="date" disabled={busy} />
      </label>
      <label className="mt-4 block">
        <span className="ev-label">Controlled issue file</span>
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

      {nativeRequired && (
        <div className="mt-4 rounded-xl border border-[#efb394] bg-[#fff7f2] p-4">
          <div className="flex items-start gap-3">
            <FileCog size={18} className="mt-0.5 shrink-0 text-[#e8733f]" />
            <div>
              <p className="text-sm font-bold text-[#8b3d1f]">Editable native source required</p>
              <p className="mt-1 text-xs leading-5 text-[#765044]">
                This PDF is being issued at the project&apos;s final {projectDeliveryStageLabel(deliveryStage)} milestone. Attach its editable DWG, DOCX or XLSX source before submission.
              </p>
            </div>
          </div>
          <label className="mt-3 block">
            <span className="ev-label">Native source file</span>
            <input
              className="block w-full cursor-pointer rounded-lg border border-dashed border-[#e5a27f] bg-white p-3 text-sm text-[#617083] file:mr-4 file:cursor-pointer file:rounded-lg file:border file:border-[#e5a27f] file:bg-[#fff7f2] file:px-4 file:py-2 file:text-sm file:font-bold file:text-[#8b3d1f]"
              name="nativeFile"
              type="file"
              accept=".dwg,.docx,.xlsx"
              required
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.item(0) ?? null;
                setNativeFile(file);
                setStatus(file ? `${file.name} will be secured with the issued PDF.` : "");
                setFailed(false);
              }}
            />
          </label>
        </div>
      )}

      <button
        type="button"
        className="ev-button mt-5 w-full"
        disabled={busy}
        onClick={(event) => startUpload(event.currentTarget.form)}
      >
        {busy ? "Working..." : "Start secure upload"}
      </button>
      {(busy || progress === 100) && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e5ebe8]" aria-label={`Upload progress ${progress}%`}>
          <div className="h-full rounded-full bg-[#e8733f] transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      {status && (
        <p
          className={`mt-3 rounded-lg p-3 text-xs leading-5 ${failed ? "border border-[#f0c8b7] bg-[#fff6f2] text-[#8b3d1f]" : "bg-[#eef4f1] text-[#0c5b45]"}`}
          role={failed ? "alert" : "status"}
        >
          {status}
        </p>
      )}
    </form>
  );
}

async function prepareFile(file: File, nativeOnly: boolean): Promise<PreparedFile> {
  const mimeType = canonicalUploadMime(file.name, file.type);
  if (!mimeType || !hasExpectedMime(file.name, mimeType) || file.size > MAX_UPLOAD_BYTES) {
    throw new Error(nativeOnly
      ? "Choose an editable DWG, DOCX or XLSX native file up to 250 MB."
      : "Choose a PDF, DOCX, XLSX or DWG file up to 250 MB.");
  }
  if (nativeOnly && !isNativeEngineeringFile(file.name)) {
    throw new Error("The native source must be a DWG, DOCX or XLSX file.");
  }
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!hasSupportedSignature(file.name, header)) {
    throw new Error("The file contents do not match the selected engineering file type.");
  }
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return {
    file,
    fileName: file.name,
    mimeType,
    size: file.size,
    sha256: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""),
  };
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
      <input className="ev-input" name={name} placeholder={placeholder} required disabled={disabled} />
    </label>
  );
}
