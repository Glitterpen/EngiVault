export const ISSUE_FOR_REVIEW = "Issued for Review (IFR)";
export const ISSUE_FOR_APPROVAL = "Issued for Approval (IFA)";
export const ISSUE_FOR_DESIGN = "Issued for Design (IFD)";
export const ISSUE_FOR_CONSTRUCTION = "Issued for Construction (IFC)";
export type CompletedIssueRevision={issue_status:string;created_at:string};
const canonicalIssueAliases:Readonly<Record<string,string>>={
  ifr:ISSUE_FOR_REVIEW.toLowerCase(),ifa:ISSUE_FOR_APPROVAL.toLowerCase(),
  ifd:ISSUE_FOR_DESIGN.toLowerCase(),ifc:ISSUE_FOR_CONSTRUCTION.toLowerCase(),
};

export function normaliseIssueSequenceStatus(issueStatus:string){
  const status=issueStatus.trim().toLowerCase();
  return Object.hasOwn(canonicalIssueAliases,status)?canonicalIssueAliases[status]:status;
}

/** All controlled prerequisites, not merely the immediately preceding label. */
export function requiredIssuePredecessors(issueStatus:string):readonly string[]{
  const status=normaliseIssueSequenceStatus(issueStatus);
  if(status===normaliseIssueSequenceStatus(ISSUE_FOR_APPROVAL))return [ISSUE_FOR_REVIEW];
  if(status===normaliseIssueSequenceStatus(ISSUE_FOR_DESIGN)||status===normaliseIssueSequenceStatus(ISSUE_FOR_CONSTRUCTION)){
    return [ISSUE_FOR_REVIEW,ISSUE_FOR_APPROVAL];
  }
  return [];
}

export function requiredIssuePredecessor(issueStatus: string) {
  return requiredIssuePredecessors(issueStatus).at(-1)??null;
}

export function missingIssuePredecessors(issueStatus:string,completedIssueStatuses:readonly string[]){
  const completed=new Set(completedIssueStatuses.map(normaliseIssueSequenceStatus));
  return requiredIssuePredecessors(issueStatus).filter(required=>!completed.has(normaliseIssueSequenceStatus(required)));
}

export function isIssueSequenceAvailable(
  issueStatus: string,
  completedIssueStatuses: readonly string[],
) {
  return missingIssuePredecessors(issueStatus,completedIssueStatuses).length===0;
}

/** The completed review must predate the approval which unlocks the final issue. */
export function isIssueSequenceAvailableForRevisions(
  issueStatus:string,completedRevisions:readonly CompletedIssueRevision[],submittedAt=Date.now(),
){
  const required=requiredIssuePredecessors(issueStatus);
  if(!required.length)return true;
  let earliestReview=Number.POSITIVE_INFINITY;
  for(const revision of completedRevisions){
    const createdAt=Date.parse(revision.created_at);
    if(normaliseIssueSequenceStatus(revision.issue_status)===normaliseIssueSequenceStatus(ISSUE_FOR_REVIEW)
      &&Number.isFinite(createdAt)&&createdAt<=submittedAt&&createdAt<earliestReview)earliestReview=createdAt;
  }
  if(!Number.isFinite(earliestReview))return false;
  if(required.length===1)return true;
  return completedRevisions.some(revision=>{
    const createdAt=Date.parse(revision.created_at);
    return normaliseIssueSequenceStatus(revision.issue_status)===normaliseIssueSequenceStatus(ISSUE_FOR_APPROVAL)
      &&Number.isFinite(createdAt)&&earliestReview<=createdAt&&createdAt<=submittedAt;
  });
}

export function blockedIssueStatuses(completedIssueStatuses: readonly string[],completedRevisions?:readonly CompletedIssueRevision[]) {
  return [ISSUE_FOR_APPROVAL, ISSUE_FOR_DESIGN, ISSUE_FOR_CONSTRUCTION].filter(
    (issueStatus) => !(completedRevisions
      ?isIssueSequenceAvailableForRevisions(issueStatus,completedRevisions)
      :isIssueSequenceAvailable(issueStatus, completedIssueStatuses)),
  );
}
