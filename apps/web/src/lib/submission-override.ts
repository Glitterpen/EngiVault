export const TRANSMITTAL_DAILY_NOTICE = "Transmittals are generated before 4:00 PM each day.";
export const TRANSMITTED_OVERRIDE_WARNING = "This document has been transmitted. Please proceed to issue it as the next revision.";

export function submissionOverrideMessage(reason: string): string | null {
  if (reason.includes("override_already_transmitted")) return TRANSMITTED_OVERRIDE_WARNING;
  if (reason.includes("override_not_current")) return "This submission has already been replaced or a newer revision exists. Refresh the document and use the current revision.";
  if (reason.includes("override_issue_status_mismatch")) return "An override must keep the same revision code and issue status as the original submission.";
  if (reason.includes("override_unavailable")) return "Only your own latest submission for this authorised deliverable can be overridden. Enter its existing revision code.";
  return null;
}
