import {DOCUMENT_ISSUE_STATUSES,type DocumentIssueStatus} from "./document-issue-status";
import type {MdrDocument,MdrRevision} from "./mdr-register-types";

// Explicit, distinct display abbreviations: Design is IFD, never Draft, and
// specialist purposes must not accidentally inherit an approval abbreviation.
const ISSUE_CODES:Record<DocumentIssueStatus,string>={
  "Draft / Work in Progress":"WIP",
  "Issued for Internal Review":"IFIR",
  "Issued for Interdiscipline Check (IDC)":"IDC",
  "Issued for Review (IFR)":"IFR",
  "Issued for Client Review":"IFCR",
  "Issued for Comment":"IFCOM",
  "Issued for Approval (IFA)":"IFA",
  "Approved / Final":"FINAL",
  "Issued for Design (IFD)":"IFD",
  "Issued for Tender (IFT)":"IFT",
  "Issued for Bid (IFB)":"IFB",
  "Issued for Quotation (IFQ)":"IFQ",
  "Issued for Procurement (IFP)":"IFP",
  "Issued for Purchase":"IFPUR",
  "Issued for Vendor Approval":"IFVA",
  "Issued for Manufacture (IFM)":"IFM",
  "Issued for Fabrication (IFF)":"IFF",
  "Approved for Construction (AFC)":"AFC",
  "Issued for Construction (IFC)":"IFC",
  "Issued for Installation":"IFINST",
  "Issued for Site Use":"IFSU",
  "Issued for Commissioning":"IFCOMM",
  "Issued for Start-up":"IFS",
  "Issued for Operations":"IFO",
  "Issued for Information (IFI)":"IFI",
  "Issued for Coordination":"IFCOORD",
  "Issued for HAZOP Review":"IFHR",
  "Issued for Safety Review":"IFSR",
  "Issued for Regulatory Approval":"IFRA",
  "Redline / Marked-up As-Built":"REDLINE",
  "As-Built":"AB",
  "Final As-Built":"FAB",
  "Issued for Handover":"IFH",
  "Approved for Handover":"AFH",
  "Final Documentation":"FD",
  "Record / Reference":"REF",
  "Superseded":"SUPERSEDED",
  "Cancelled":"CANCELLED",
  "Void / Withdrawn":"VOID",
};

const uploadedStates=new Set(["quarantined","queued","processing","ready","failed"]);
const submittedControls=new Set(["submitted","accepted","returned"]);
const issuePurposes=new Map<string,{code:string;label:string}>();
for(const {value} of DOCUMENT_ISSUE_STATUSES){
  const purpose={code:ISSUE_CODES[value],label:value};
  issuePurposes.set(value.toLowerCase(),purpose);
  issuePurposes.set(value.replace(/\s*\([^)]+\)$/," ").trim().toLowerCase(),purpose);
  issuePurposes.set(purpose.code.toLowerCase(),purpose);
}

export type MdrSubmissionStatus={code:string;label:string;revisionCode:string;submittedAt:string;controlStatus:string};

function submittedTime(revision:MdrRevision):number|null{
  if(!uploadedStates.has(revision.state)||!submittedControls.has(revision.control_status??"")||!revision.created_at?.trim())return null;
  // Date.parse accepts ambiguous bare numbers and silently rolls some invalid
  // dates (for example 30 February) forward. Stored timestamps must identify a
  // real calendar date before they can decide which issue purpose is current.
  const date=revision.created_at.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s|$)/);
  if(!date)return null;
  const year=Number(date[1]),month=Number(date[2]),day=Number(date[3]);
  const leap=year%4===0&&(year%100!==0||year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(month<1||month>12||day<1||day>days[month-1])return null;
  const timestamp=Date.parse(revision.created_at);
  return Number.isFinite(timestamp)?timestamp:null;
}

/** Latest actual submission, not its planned purpose or highest workflow stage. */
export function latestMdrSubmission(document:Pick<MdrDocument,"document_revisions">):MdrSubmissionStatus|null{
  let latest:MdrRevision|undefined,latestTime=-Infinity;
  for(const revision of document.document_revisions){
    const time=submittedTime(revision);
    if(time===null)continue;
    // Embedded revisions are not ordered. Resolve equal timestamps by their
    // stable identifiers without mutating the original revision collection.
    if(time>latestTime||(time===latestTime&&(revision.id??"")>(latest?.id??""))){latest=revision;latestTime=time;}
  }
  if(!latest)return null;
  const rawPurpose=latest.issue_status?.trim()??"";
  const purpose=issuePurposes.get(rawPurpose.toLowerCase())??{code:"Submitted",label:rawPurpose||"Issue purpose not specified"};
  return {...purpose,revisionCode:latest.revision_code?.trim()??"",submittedAt:latest.created_at!,controlStatus:latest.control_status!};
}
