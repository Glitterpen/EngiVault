import { fileExtension } from "@/lib/file-validation";
import { projectTerminalIssueStatus, type ProjectDeliveryStage } from "@/lib/project-delivery-stage";

export function requiresNativeCompanion(
  deliveryStage: ProjectDeliveryStage,
  issueStatus: string | null | undefined,
  primaryFileName: string | null | undefined,
) {
  if (deliveryStage === "concept" || fileExtension(primaryFileName ?? "") !== "pdf") return false;
  return issueStatus === projectTerminalIssueStatus(deliveryStage);
}
