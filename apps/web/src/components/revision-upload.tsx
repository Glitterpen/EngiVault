"use client";
import { customerErrorMessage } from "@/lib/customer-messages";


import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, FileCog, UploadCloud } from "lucide-react";
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
  isIssueSequenceAvailableForRevisions,
  missingIssuePredecessors,
  ISSUE_FOR_APPROVAL,
  type CompletedIssueRevision,
} from "@/lib/document-issue-sequence";
import { createClient } from "@/lib/supabase/browser";
import { HelpTip } from "@/components/help-tip";
import { TRANSMITTAL_DAILY_NOTICE } from "@/lib/submission-override";

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
  completedIssueRevisions,
}: {
  organisationId: string;
  projectId: string;
  documentId: string;
  deliveryStage: ProjectDeliveryStage;
  completedIssueStatuses: string[];
  completedIssueRevisions?: CompletedIssueRevision[];
}) {
  const router = useRouter();
  const formId = useId();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [nativeFile, setNativeFile] = useState<File | null>(null);
  const [issueStatus, setIssueStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const [override, setOverride] = useState(false);
  const [overrideChecking, setOverrideChecking] = useState(false);
  const [overrideRevisionId, setOverrideRevisionId] = useState<string | null>(null);
  const [overrideMessage, setOverrideMessage] = useState("");
  const overrideRequest = useRef(0);
  const nativeRequired = requiresNativeCompanion(deliveryStage, issueStatus, selectedFile?.name);
  const unavailableIssueStatuses = blockedIssueStatuses(completedIssueStatuses,completedIssueRevisions);
  const hasSubmittedIfr = !unavailableIssueStatuses.includes(ISSUE_FOR_APPROVAL);
  const hasSubmittedIfa = unavailableIssueStatuses.length===0;

  function clearOverride() {
    overrideRequest.current += 1;
    setOverride(false);
    setOverrideChecking(false);
    setOverrideRevisionId(null);
    setOverrideMessage("");
  }

  async function checkOverride(form: HTMLFormElement | null, checked: boolean) {
    clearOverride();
    if (!checked || !form) return;
    const requestId = overrideRequest.current;
    setOverride(true);
    setOverrideChecking(true);
    const code = String(new FormData(form).get("revisionCode") ?? "").trim();
    try {
      const response = await fetch(`/api/v1/organisations/${organisationId}/projects/${projectId}/documents/${documentId}/revisions/upload-session?revisionCode=${encodeURIComponent(code)}`, { cache: "no-store" });
      const result = await response.json();
      if (requestId !== overrideRequest.current) return;
      if (!response.ok || !result.allowed || !result.revisionId) {
        setOverrideMessage(result.error?.message ?? result.message ?? "The transmittal status could not be verified.");
      } else if (result.issueStatus !== new FormData(form).get("issueStatus")) {
        setOverrideMessage(`Keep the original issue status: ${result.issueStatus}. Then check Override again.`);
      } else {
        setOverrideRevisionId(result.revisionId);
        setOverrideMessage("The replacement will require fresh security processing and DCC review. The original remains in history.");
      }
    } catch {
      if (requestId === overrideRequest.current) setOverrideMessage("The transmittal status could not be verified. Check your connection and try again.");
    } finally {
      if (requestId === overrideRequest.current) setOverrideChecking(false);
    }
  }

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
            overrideRevisionId: override ? overrideRevisionId : undefined,
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
      const { error } = await storage.uploadToSignedUrl(session.path, session.token, preparedPrimary.file, {
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
      clearOverride();
    } catch (error) {
      setFailed(true);
      setProgress(0);
      setStatus(customerErrorMessage(error,"Upload failed."));
      // Expose recovery if registration succeeded but a later upload step failed.
      router.refresh();
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
    if (override && (!overrideRevisionId || overrideChecking)) {
      setFailed(true);
      setStatus(overrideMessage || "Wait for the transmittal check before starting the upload.");
      return;
    }
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
    const missingPredecessors=missingIssuePredecessors(String(formData.get("issueStatus")??""),completedIssueStatuses);
    const orderedSequenceAvailable=!completedIssueRevisions||isIssueSequenceAvailableForRevisions(String(formData.get("issueStatus")??""),completedIssueRevisions);
    if(missingPredecessors.length||!orderedSequenceAvailable){
      const statusInput=form.elements.namedItem("issueStatus");
      setFailed(true);
      setStatus(missingPredecessors.length
        ?`Complete secure submission of ${missingPredecessors.join(" and ")} for this document before selecting this issue purpose.`
        :"The controlled sequence must be submitted in order: IFR before IFA, then IFD or IFC. Complete the missing ordered stage before starting this upload.");
      if(statusInput instanceof HTMLElement)statusInput.focus();
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
      aria-labelledby={`${formId}-heading`}
      aria-busy={busy}
      className="ev-card min-w-0 overflow-visible p-4 sm:p-5 lg:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <UploadCloud size={19} aria-hidden="true" className="shrink-0 text-[#10243e]" />
          <h2 id={`${formId}-heading`} className="text-base font-semibold text-[#14263d]">Upload revision</h2>
        </div>
        <div className="flex items-center gap-1 text-xs font-medium text-[#526279]">
          <span className="rounded-md bg-[#eef3fa] px-2 py-1 text-[#24384f]">{projectDeliveryStageLabel(deliveryStage)}</span>
          <HelpTip label="Revision workflow guidance">
            {projectDeliveryStage(deliveryStage)?.workflow}. DCC-accepted progress reaches 100% at {projectTerminalIssueStatus(deliveryStage)}.
          </HelpTip>
        </div>
      </div>

      <fieldset className="mt-4 min-w-0">
        <legend className="sr-only">Revision details</legend>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field name="revisionCode" label="Revision" placeholder="e.g. R01" disabled={busy} onChange={clearOverride} />
          <div className="min-w-0 [&>div]:mt-0 [&>div>div]:mb-1.5 [&>div>div]:min-h-8">
            <IssueStatusSelect
              name="issueStatus"
              disabled={busy}
              disabledValues={unavailableIssueStatuses}
              onChange={(event) => {
                setIssueStatus(event.currentTarget.value);
                clearOverride();
                setFailed(false);
                setStatus("");
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="ev-label flex min-h-8 items-center gap-1.5"><label htmlFor={`${formId}-date`}>Issue date</label><span className="font-normal text-[#617083]">(optional)</span></div>
            <input id={`${formId}-date`} className="ev-input min-w-0" name="issueDate" type="date" disabled={busy} />
          </div>
        </div>
        {(!hasSubmittedIfr || !hasSubmittedIfa) && (
          <div className="mt-2 flex items-center gap-1 text-xs leading-5 text-[#526279]">
            <span>{!hasSubmittedIfr ? "Submit IFR first." : "IFR complete. Submit IFA next."}</span>
            <HelpTip label="Controlled issue sequence guidance">IFR must complete secure submission before IFA becomes available. IFA must then complete secure submission before IFD or IFC becomes available.</HelpTip>
          </div>
        )}
      </fieldset>

      <fieldset className="mt-5 min-w-0 border-t border-[#e5eaf0] pt-4">
        <legend className="sr-only">Revision files</legend>
        <div className={`grid min-w-0 gap-3 ${nativeRequired ? "lg:grid-cols-2" : ""}`}>
          <div className="min-w-0 rounded-xl border border-[#dfe5eb] bg-[#fafcfd] p-3 sm:p-4">
            <label htmlFor={`${formId}-file`} className="ev-label mb-1 flex min-h-8 items-center text-[#24384f]">Controlled issue file</label>
            <p id={`${formId}-file-format`} className="mb-3 text-xs leading-5 text-[#526279]">PDF, DOCX, XLSX or DWG · maximum 250 MB</p>
            <input
              id={`${formId}-file`}
              aria-describedby={`${formId}-file-format${selectedFile ? ` ${formId}-file-selected` : ""}`}
              className="block min-h-11 w-full min-w-0 cursor-pointer truncate rounded-lg text-sm text-[#526279] outline-offset-4 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border file:border-[#ced6df] file:bg-white file:px-3 file:text-sm file:font-semibold file:text-[#24384f] hover:file:bg-[#f1f5f7] focus-visible:outline-2 focus-visible:outline-[#10243e] disabled:cursor-not-allowed disabled:opacity-60"
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
            {selectedFile && <SelectedFile id={`${formId}-file-selected`} file={selectedFile} />}
          </div>

          {nativeRequired && (
            <div className="min-w-0 rounded-xl border border-[#dfe5eb] bg-[#fafcfd] p-3 sm:p-4">
              <div className="mb-1 flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1">
                <FileCog size={16} aria-hidden="true" className="shrink-0 text-[#10243e]" />
                <label htmlFor={`${formId}-native`} className="ev-label mb-0 text-[#24384f]">Native source file</label>
                <span className="text-xs font-semibold text-[#8b3d1f]">Required</span>
                <HelpTip label="Native source requirement">This PDF is being issued at the project&apos;s final {projectDeliveryStageLabel(deliveryStage)} milestone. Attach its editable DWG, DOCX or XLSX source before submission.</HelpTip>
              </div>
              <p id={`${formId}-native-format`} className="mb-3 text-xs leading-5 text-[#526279]">Editable DWG, DOCX or XLSX · maximum 250 MB</p>
              <input
                id={`${formId}-native`}
                aria-describedby={`${formId}-native-format${nativeFile ? ` ${formId}-native-selected` : ""}`}
                className="block min-h-11 w-full min-w-0 cursor-pointer truncate rounded-lg text-sm text-[#526279] outline-offset-4 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border file:border-[#ced6df] file:bg-white file:px-3 file:text-sm file:font-semibold file:text-[#24384f] hover:file:bg-[#f1f5f7] focus-visible:outline-2 focus-visible:outline-[#10243e] disabled:cursor-not-allowed disabled:opacity-60"
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
              {nativeFile && <SelectedFile id={`${formId}-native-selected`} file={nativeFile} />}
            </div>
          )}
        </div>
      </fieldset>

      <div className="mt-4 border-t border-[#e5eaf0] pt-3">
        <div className="flex items-center gap-1">
          <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 text-sm font-medium text-[#24384f]">
            <input type="checkbox" name="overrideSubmission" checked={override} disabled={busy}
              className="h-4 w-4 shrink-0 accent-[#10243e]"
              onChange={event => void checkOverride(event.currentTarget.form, event.currentTarget.checked)} />
            <span>Override existing submission</span>
          </label>
          <HelpTip label="About submission overrides">Use the same revision code and issue status to replace your latest submission before DCC generates its transmittal. The existing file is retained in the audit history.</HelpTip>
        </div>
        {overrideChecking && <p role="status" className="mt-2 text-xs">Checking transmittal status...</p>}
        {overrideMessage && <p role={overrideRevisionId ? "status" : "alert"} className={`mt-2 break-words rounded-lg border p-3 text-sm leading-6 ${overrideRevisionId ? "border-[#d6e0ed] bg-[#f4f7fb] text-[#10243e]" : "border-[#efd1c1] bg-[#fff8f3] text-[#8b3d1f]"}`}>{overrideMessage}</p>}
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 max-w-lg text-xs leading-5 text-[#526279]">{TRANSMITTAL_DAILY_NOTICE}</p>
        <button
          type="button"
          className="ev-button w-full shrink-0 sm:w-auto"
          disabled={busy || overrideChecking || (override && !overrideRevisionId)}
          onClick={(event) => startUpload(event.currentTarget.form)}
        >
          <UploadCloud size={17} aria-hidden="true" />
          {busy ? "Working..." : "Start secure upload"}
        </button>
      </div>
      {(busy || progress === 100) && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-[#526279]"><span>Secure upload</span><span>{progress}%</span></div>
          <div role="progressbar" aria-label="Secure upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 overflow-hidden rounded-full bg-[#eef3fa]">
            <div className="h-full rounded-full bg-[#10243e] transition-all motion-reduce:transition-none" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {status && (
        <p
          className={`mt-3 break-words rounded-lg p-3 text-sm leading-6 ${failed ? "border border-[#f0c8b7] bg-[#fff6f2] text-[#8b3d1f]" : "bg-[#f4f7fb] text-[#10243e]"}`}
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
    // Signed multipart uploads use File.type for the part, not contentType.
    // Preserve the validated/hashed bytes while normalising browser DWG labels.
    file: new File([file], file.name, { type: mimeType, lastModified: file.lastModified }),
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
  onChange,
}: {
  name: string;
  label: string;
  placeholder: string;
  disabled: boolean;
  onChange?: () => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="ev-label flex min-h-8 items-center">{label}</span>
      <input className="ev-input" name={name} placeholder={placeholder} required disabled={disabled} onChange={onChange} />
    </label>
  );
}

function SelectedFile({id,file}:{id:string;file:File}) {
  const size=file.size<1024*1024?`${Math.max(1,Math.ceil(file.size/1024))} KB`:`${(file.size/(1024*1024)).toFixed(1)} MB`;
  return <p id={id} className="mt-3 flex min-w-0 items-start gap-2 text-xs leading-5 text-[#24384f]">
    <FileCheck2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
    <span className="min-w-0 [overflow-wrap:anywhere]"><span className="font-medium">{file.name}</span><span className="ml-1 text-[#526279]">· {size}</span></span>
  </p>;
}
