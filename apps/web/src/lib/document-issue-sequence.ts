export const ISSUE_FOR_REVIEW = "Issued for Review (IFR)";
export const ISSUE_FOR_APPROVAL = "Issued for Approval (IFA)";
export const ISSUE_FOR_DESIGN = "Issued for Design (IFD)";
export const ISSUE_FOR_CONSTRUCTION = "Issued for Construction (IFC)";

export function requiredIssuePredecessor(issueStatus: string) {
  if (issueStatus === ISSUE_FOR_APPROVAL) return ISSUE_FOR_REVIEW;
  if (issueStatus === ISSUE_FOR_DESIGN || issueStatus === ISSUE_FOR_CONSTRUCTION) {
    return ISSUE_FOR_APPROVAL;
  }
  return null;
}

export function isIssueSequenceAvailable(
  issueStatus: string,
  completedIssueStatuses: readonly string[],
) {
  const predecessor = requiredIssuePredecessor(issueStatus);
  return predecessor === null || completedIssueStatuses.includes(predecessor);
}

export function blockedIssueStatuses(completedIssueStatuses: readonly string[]) {
  return [ISSUE_FOR_APPROVAL, ISSUE_FOR_DESIGN, ISSUE_FOR_CONSTRUCTION].filter(
    (issueStatus) => !isIssueSequenceAvailable(issueStatus, completedIssueStatuses),
  );
}
