export const PROJECT_DELIVERY_STAGES = [
  {
    value: "concept",
    label: "Concept",
    terminalIssueStatus: "Issued for Approval (IFA)",
    workflow: "Issued for Review → Issued for Approval",
  },
  {
    value: "feed",
    label: "FEED",
    terminalIssueStatus: "Issued for Design (IFD)",
    workflow: "Issued for Review → Issued for Approval → Issued for Design",
  },
  {
    value: "ded",
    label: "Detailed Engineering Design (DED)",
    terminalIssueStatus: "Issued for Construction (IFC)",
    workflow: "Issued for Review → Issued for Approval → Issued for Construction",
  },
] as const;

export type ProjectDeliveryStage = (typeof PROJECT_DELIVERY_STAGES)[number]["value"];

export const PROJECT_DELIVERY_STAGE_VALUES = PROJECT_DELIVERY_STAGES.map(
  ({ value }) => value,
) as [ProjectDeliveryStage, ...ProjectDeliveryStage[]];

export function projectDeliveryStage(value: string | null | undefined) {
  return PROJECT_DELIVERY_STAGES.find((stage) => stage.value === value) ?? null;
}

export function projectDeliveryStageLabel(value: string | null | undefined) {
  return projectDeliveryStage(value)?.label ?? "Delivery stage not configured";
}

export function projectTerminalIssueStatus(value: string | null | undefined) {
  return projectDeliveryStage(value)?.terminalIssueStatus ?? "Configure the project delivery stage";
}

export function projectIssueProgressCredit(
  issueStatus: string | null | undefined,
  deliveryStage: ProjectDeliveryStage,
) {
  const issue = issueStatus?.trim().toLowerCase() ?? "";
  if (!issue || /(cancelled|superseded|void|withdrawn)/.test(issue)) return 0;
  if (/draft|work in progress/.test(issue)) return 10;
  if (/internal review|interdiscipline|\bidc\b/.test(issue)) return 20;

  const construction = /issued for construction|approved for construction|\bifc\b|\bafc\b|issued for installation|issued for site use|issued for commissioning|issued for start-up|issued for operations|as-built|as built|handover|final documentation/.test(issue);
  const design = /issued for design|\bifd\b/.test(issue);
  const approval = /issued for approval|\bifa\b|approved \/ final/.test(issue);
  const review = /issued for review|\bifr\b|client review|issued for comment/.test(issue);

  if (construction) return 100;
  if (deliveryStage === "concept") {
    if (design || approval) return 100;
    return review ? 50 : 0;
  }
  if (deliveryStage === "feed") {
    if (design) return 100;
    if (approval) return 67;
    return review ? 33 : 0;
  }
  if (design) return 75;
  if (approval) return 67;
  return review ? 33 : 0;
}
