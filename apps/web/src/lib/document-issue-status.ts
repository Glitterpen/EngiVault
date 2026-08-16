export const DOCUMENT_ISSUE_STATUS_GROUPS = [
  "Review and approval",
  "Design and procurement",
  "Construction and commissioning",
  "Information and specialist review",
  "Handover and closeout",
  "Records management",
] as const;

export const DOCUMENT_ISSUE_STATUSES = [
  { group: "Review and approval", value: "Draft / Work in Progress" },
  { group: "Review and approval", value: "Issued for Internal Review" },
  { group: "Review and approval", value: "Issued for Interdiscipline Check (IDC)" },
  { group: "Review and approval", value: "Issued for Review (IFR)" },
  { group: "Review and approval", value: "Issued for Client Review" },
  { group: "Review and approval", value: "Issued for Comment" },
  { group: "Review and approval", value: "Issued for Approval (IFA)" },
  { group: "Review and approval", value: "Approved / Final" },

  { group: "Design and procurement", value: "Issued for Design (IFD)" },
  { group: "Design and procurement", value: "Issued for Tender (IFT)" },
  { group: "Design and procurement", value: "Issued for Bid (IFB)" },
  { group: "Design and procurement", value: "Issued for Quotation (IFQ)" },
  { group: "Design and procurement", value: "Issued for Procurement (IFP)" },
  { group: "Design and procurement", value: "Issued for Purchase" },
  { group: "Design and procurement", value: "Issued for Vendor Approval" },
  { group: "Design and procurement", value: "Issued for Manufacture (IFM)" },
  { group: "Design and procurement", value: "Issued for Fabrication (IFF)" },

  { group: "Construction and commissioning", value: "Approved for Construction (AFC)" },
  { group: "Construction and commissioning", value: "Issued for Construction (IFC)" },
  { group: "Construction and commissioning", value: "Issued for Installation" },
  { group: "Construction and commissioning", value: "Issued for Site Use" },
  { group: "Construction and commissioning", value: "Issued for Commissioning" },
  { group: "Construction and commissioning", value: "Issued for Start-up" },
  { group: "Construction and commissioning", value: "Issued for Operations" },

  { group: "Information and specialist review", value: "Issued for Information (IFI)" },
  { group: "Information and specialist review", value: "Issued for Coordination" },
  { group: "Information and specialist review", value: "Issued for HAZOP Review" },
  { group: "Information and specialist review", value: "Issued for Safety Review" },
  { group: "Information and specialist review", value: "Issued for Regulatory Approval" },

  { group: "Handover and closeout", value: "Redline / Marked-up As-Built" },
  { group: "Handover and closeout", value: "As-Built" },
  { group: "Handover and closeout", value: "Final As-Built" },
  { group: "Handover and closeout", value: "Issued for Handover" },
  { group: "Handover and closeout", value: "Approved for Handover" },
  { group: "Handover and closeout", value: "Final Documentation" },

  { group: "Records management", value: "Record / Reference" },
  { group: "Records management", value: "Superseded" },
  { group: "Records management", value: "Cancelled" },
  { group: "Records management", value: "Void / Withdrawn" },
] as const;

export type DocumentIssueStatus = (typeof DOCUMENT_ISSUE_STATUSES)[number]["value"];

export const DOCUMENT_ISSUE_STATUS_VALUES = DOCUMENT_ISSUE_STATUSES.map(
  ({ value }) => value,
) as [DocumentIssueStatus, ...DocumentIssueStatus[]];

const documentIssueStatusSet = new Set<string>(DOCUMENT_ISSUE_STATUS_VALUES);

export function isDocumentIssueStatus(value: string): value is DocumentIssueStatus {
  return documentIssueStatusSet.has(value);
}
