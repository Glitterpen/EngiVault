import { describe, expect, it } from "vitest";
import {
  blockedIssueStatuses,
  isIssueSequenceAvailable,
  isIssueSequenceAvailableForRevisions,
  ISSUE_FOR_APPROVAL,
  ISSUE_FOR_CONSTRUCTION,
  ISSUE_FOR_DESIGN,
  ISSUE_FOR_REVIEW,
  missingIssuePredecessors,
  requiredIssuePredecessors,
  requiredIssuePredecessor,
  type CompletedIssueRevision,
} from "./document-issue-sequence";
const acceptedRevision=(issue_status:string,created_at:string,overrides:Partial<CompletedIssueRevision>={}):CompletedIssueRevision=>({
  issue_status,created_at,reviewed_at:null,control_status:"accepted",state:"ready",overridden_by_revision_id:null,...overrides,
});

describe("controlled document issue sequence", () => {
  it("requires IFR before IFA", () => {
    expect(requiredIssuePredecessor(ISSUE_FOR_APPROVAL)).toBe(ISSUE_FOR_REVIEW);
    expect(isIssueSequenceAvailable(ISSUE_FOR_APPROVAL, [])).toBe(false);
    expect(isIssueSequenceAvailable(ISSUE_FOR_APPROVAL, [ISSUE_FOR_REVIEW])).toBe(true);
  });

  it("requires both IFR and IFA before either terminal design issue", () => {
    expect(requiredIssuePredecessor(ISSUE_FOR_DESIGN)).toBe(ISSUE_FOR_APPROVAL);
    expect(requiredIssuePredecessor(ISSUE_FOR_CONSTRUCTION)).toBe(ISSUE_FOR_APPROVAL);
    expect(isIssueSequenceAvailable(ISSUE_FOR_DESIGN, [ISSUE_FOR_REVIEW])).toBe(false);
    expect(isIssueSequenceAvailable(ISSUE_FOR_CONSTRUCTION, [ISSUE_FOR_APPROVAL])).toBe(false);
    for(const terminal of [ISSUE_FOR_DESIGN,ISSUE_FOR_CONSTRUCTION]){
      expect(requiredIssuePredecessors(terminal)).toEqual([ISSUE_FOR_REVIEW,ISSUE_FOR_APPROVAL]);
      expect(isIssueSequenceAvailable(terminal,[ISSUE_FOR_REVIEW,ISSUE_FOR_APPROVAL])).toBe(true);
      expect(missingIssuePredecessors(terminal,[ISSUE_FOR_APPROVAL])).toEqual([ISSUE_FOR_REVIEW]);
      expect(missingIssuePredecessors(terminal,[])).toEqual([ISSUE_FOR_REVIEW,ISSUE_FOR_APPROVAL]);
    }
  });

  it("matches controlled labels with case and outer whitespace normalised",()=>{
    expect(requiredIssuePredecessors(" issued FOR design (ifd) ")).toEqual([ISSUE_FOR_REVIEW,ISSUE_FOR_APPROVAL]);
    expect(isIssueSequenceAvailable(" issued for approval (ifa) ",[" ISSUED FOR REVIEW (ifr) "])).toBe(true);
    expect(isIssueSequenceAvailable(ISSUE_FOR_DESIGN,[" issued FOR review (ifr) "," ISSUED FOR APPROVAL (ifa) "])).toBe(true);
    expect(isIssueSequenceAvailable(ISSUE_FOR_DESIGN,[" IFA "," IFR "])).toBe(true);
    expect(requiredIssuePredecessors(" ifd ")).toEqual([ISSUE_FOR_REVIEW,ISSUE_FOR_APPROVAL]);
  });

  it("does not restrict other issue purposes", () => {
    expect(isIssueSequenceAvailable("Issued for Information (IFI)", [])).toBe(true);
    expect(isIssueSequenceAvailable("Approved / Final", [])).toBe(true);
    expect(isIssueSequenceAvailable("Issued for Approval (IFA)",["Issued for Review (IFR) additional text"])).toBe(false);
  });

  it("reports every unavailable controlled stage", () => {
    expect(blockedIssueStatuses([])).toEqual([
      ISSUE_FOR_APPROVAL,
      ISSUE_FOR_DESIGN,
      ISSUE_FOR_CONSTRUCTION,
    ]);
    expect(blockedIssueStatuses([ISSUE_FOR_REVIEW])).toEqual([
      ISSUE_FOR_DESIGN,
      ISSUE_FOR_CONSTRUCTION,
    ]);
    expect(blockedIssueStatuses([ISSUE_FOR_REVIEW, ISSUE_FOR_APPROVAL])).toEqual([]);
  });

  it("requires the IFR to precede the qualifying IFA, not merely exist somewhere in history",()=>{
    const legacyIfa=acceptedRevision(ISSUE_FOR_APPROVAL,"2026-09-01T12:00:00Z");
    const laterIfr=acceptedRevision(ISSUE_FOR_REVIEW,"2026-09-02T12:00:00Z");
    const beforeSubmission=Date.parse("2026-10-01T12:00:00Z");
    expect(isIssueSequenceAvailableForRevisions(ISSUE_FOR_DESIGN,[legacyIfa,laterIfr],beforeSubmission)).toBe(false);
    const orderedIfa=acceptedRevision(ISSUE_FOR_APPROVAL,"2026-09-03T12:00:00Z");
    expect(isIssueSequenceAvailableForRevisions(ISSUE_FOR_DESIGN,[orderedIfa,legacyIfa,laterIfr],beforeSubmission)).toBe(true);
  });

  it("does not use a future or invalid prerequisite timestamp",()=>{
    const when=Date.parse("2026-10-01T12:00:00Z");
    expect(isIssueSequenceAvailableForRevisions(ISSUE_FOR_APPROVAL,[acceptedRevision("IFR","2026-10-02T12:00:00Z")],when)).toBe(false);
    expect(isIssueSequenceAvailableForRevisions(ISSUE_FOR_APPROVAL,[acceptedRevision("IFR","invalid")],when)).toBe(false);
    expect(isIssueSequenceAvailableForRevisions(ISSUE_FOR_DESIGN,[acceptedRevision("IFR","2026-09-01T12:00:00Z"),acceptedRevision("IFA","2026-10-02T12:00:00Z")],when)).toBe(false);
  });

  it("normalises exact acronyms and permits equal transaction timestamps for a valid completed chain",()=>{
    const created_at="2026-09-01T12:00:00Z";
    expect(isIssueSequenceAvailableForRevisions("IFD",[acceptedRevision(" ifr ",created_at),acceptedRevision(" IFA ",created_at)],Date.parse(created_at))).toBe(true);
    expect(isIssueSequenceAvailableForRevisions("Issued for Information (IFI)",[],Date.parse(created_at))).toBe(true);
    expect(blockedIssueStatuses([ISSUE_FOR_REVIEW,ISSUE_FOR_APPROVAL],[acceptedRevision(ISSUE_FOR_APPROVAL,created_at)])).toEqual([ISSUE_FOR_APPROVAL,ISSUE_FOR_DESIGN,ISSUE_FOR_CONSTRUCTION]);
  });

  it.each(["submitted","returned"])("does not unlock IFA from a ready but %s IFR",control_status=>{
    expect(isIssueSequenceAvailableForRevisions(ISSUE_FOR_APPROVAL,[acceptedRevision(ISSUE_FOR_REVIEW,"2026-09-01T12:00:00Z",{control_status})])).toBe(false);
  });
  it("does not unlock IFD from an unaccepted IFA even when IFR is DCC accepted",()=>{
    expect(isIssueSequenceAvailableForRevisions(ISSUE_FOR_DESIGN,[acceptedRevision(ISSUE_FOR_REVIEW,"2026-09-01T12:00:00Z"),acceptedRevision(ISSUE_FOR_APPROVAL,"2026-09-02T12:00:00Z",{control_status:"submitted"})])).toBe(false);
  });
  it.each([{state:"pending_upload"},{state:"processing"},{state:"failed"},{overridden_by_revision_id:"replacement"}])("rejects unsafe accepted predecessor records: %j",override=>{
    expect(isIssueSequenceAvailableForRevisions(ISSUE_FOR_APPROVAL,[acceptedRevision(ISSUE_FOR_REVIEW,"2026-09-01T12:00:00Z",override)])).toBe(false);
  });
  it("requires valid acceptance evidence by the new attempt cutoff, with a null legacy fallback",()=>{
    const when=Date.parse("2026-10-01T12:00:00Z");
    expect(isIssueSequenceAvailableForRevisions(ISSUE_FOR_APPROVAL,[acceptedRevision("IFR","2026-09-01T12:00:00Z",{reviewed_at:"2026-10-02T12:00:00Z"})],when)).toBe(false);
    expect(isIssueSequenceAvailableForRevisions(ISSUE_FOR_APPROVAL,[acceptedRevision("IFR","2026-09-01T12:00:00Z",{reviewed_at:"invalid"})],when)).toBe(false);
    expect(isIssueSequenceAvailableForRevisions(ISSUE_FOR_APPROVAL,[acceptedRevision("IFR","2026-09-01T12:00:00Z",{reviewed_at:null})],when)).toBe(true);
  });
  it("preserves legacy accepted stages without retroactively comparing their acceptance ordering",()=>{
    const when=Date.parse("2026-10-01T12:00:00Z");
    const records=[acceptedRevision("IFR","2026-09-01T12:00:00Z",{reviewed_at:"2026-09-09T12:00:00Z"}),acceptedRevision("IFA","2026-09-02T12:00:00Z",{reviewed_at:"2026-09-04T12:00:00Z"})];
    expect(isIssueSequenceAvailableForRevisions(ISSUE_FOR_DESIGN,records,when)).toBe(true);
  });
});
