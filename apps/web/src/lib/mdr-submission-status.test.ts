import {describe,expect,it} from "vitest";
import {DOCUMENT_ISSUE_STATUSES} from "./document-issue-status";
import type {MdrRevision} from "./mdr-register-types";
import {latestMdrSubmission} from "./mdr-submission-status";

function revision(overrides:Partial<MdrRevision>={}):MdrRevision{
  return {id:"revision-a",revision_code:"R01",issue_status:"Issued for Review (IFR)",created_at:"2026-10-10T12:00:00Z",state:"ready",control_status:"accepted",...overrides};
}
function submission(...revisions:MdrRevision[]){return latestMdrSubmission({document_revisions:revisions});}

describe("latest MDR submission",()=>{
  it("uses the most recently submitted purpose rather than document draft, revision code or highest stage",()=>{
    const rows=[revision({id:"old",revision_code:"Z99",issue_status:"Issued for Construction (IFC)",created_at:"2026-10-08T12:00:00Z"}),
      revision({id:"latest",revision_code:"R01",issue_status:"Issued for Review (IFR)",created_at:"2026-10-12T12:00:00Z",control_status:"submitted"}),
      revision({id:"middle",revision_code:"A02",issue_status:"Issued for Approval (IFA)",created_at:"2026-10-10T12:00:00Z"})];
    const before=structuredClone(rows);
    expect(latestMdrSubmission({document_revisions:rows})).toEqual({code:"IFR",label:"Issued for Review (IFR)",revisionCode:"R01",submittedAt:"2026-10-12T12:00:00Z",controlStatus:"submitted"});
    expect(rows).toEqual(before);
  });
  it("does not let a newer pending upload replace an actual submission",()=>{
    expect(submission(revision(),revision({state:"pending_upload",issue_status:"Issued for Design (IFD)",created_at:"2026-10-14T12:00:00Z",control_status:"submitted"}))?.code).toBe("IFR");
  });
  it("retains a returned latest submission without claiming that it was approved",()=>{
    expect(submission(revision(),revision({id:"returned",revision_code:"A01",issue_status:"Issued for Approval (IFA)",created_at:"2026-10-14T12:00:00Z",control_status:"returned"})))
      .toMatchObject({code:"IFA",label:"Issued for Approval (IFA)",revisionCode:"A01",controlStatus:"returned"});
  });
  it.each(["pending_upload","superseded","cancelled","unknown"])("ignores %s revisions, including overridden historical records",state=>{
    expect(submission(revision(),revision({id:"excluded",state,issue_status:"Issued for Construction (IFC)",created_at:"2026-10-14T12:00:00Z"}))?.code).toBe("IFR");
  });
  it.each(["quarantined","queued","processing","ready","failed"])("includes a submitted file with processing state %s",state=>{
    expect(submission(revision({state,control_status:"submitted"}))?.code).toBe("IFR");
  });
  it.each(["submitted","accepted","returned"])("accepts actual submission control status %s",control_status=>{
    expect(submission(revision({control_status}))?.controlStatus).toBe(control_status);
  });
  it.each([undefined,null,""," ","draft","pending","cancelled"])("does not infer submission from the file state when control status is %s",control_status=>{
    expect(submission(revision({control_status}))).toBeNull();
  });
  it.each([undefined,null,""," ","invalid date","1","2026-99-99T12:00:00Z","2026-02-30T12:00:00Z","2025-02-29T12:00:00Z"])("ignores a missing or invalid submission date %s",created_at=>{
    expect(submission(revision({created_at}))).toBeNull();
  });
  it("sorts timestamps as dates, including timezone offsets",()=>{
    expect(submission(revision({id:"later-string",created_at:"2026-10-10T12:30:00+03:00",issue_status:"IFC"}),revision({id:"later-time",created_at:"2026-10-10T10:00:00Z",issue_status:"IFA"}))?.code).toBe("IFA");
  });
  it("resolves identical timestamps by stable revision id regardless of embedded order",()=>{
    const a=revision({id:"revision-a",issue_status:"IFR"}),b=revision({id:"revision-b",issue_status:"IFA"});
    expect(submission(a,b)).toEqual(submission(b,a));
    expect(submission(a,b)?.code).toBe("IFA");
  });
  it.each([
    ["ifR","IFR","Issued for Review (IFR)"],
    [" Issued for Approval ","IFA","Issued for Approval (IFA)"],
    ["IFD","IFD","Issued for Design (IFD)"],
    ["Issued for Construction (IFC)","IFC","Issued for Construction (IFC)"],
    ["IDC","IDC","Issued for Interdiscipline Check (IDC)"],
    ["AFC","AFC","Approved for Construction (AFC)"],
  ])("normalizes legacy purpose %s without treating the revision label as its purpose",(issue_status,code,label)=>{
    expect(submission(revision({issue_status,revision_code:"B-17"}))).toMatchObject({code,label,revisionCode:"B-17"});
  });
  it("keeps Draft / Work in Progress distinct from Design",()=>{
    expect(submission(revision({issue_status:"Draft / Work in Progress"}))?.code).toBe("WIP");
    expect(submission(revision({issue_status:"Issued for Design (IFD)"}))?.code).toBe("IFD");
  });
  it("has a distinct explicit code and original label for every controlled issue purpose",()=>{
    const statuses=DOCUMENT_ISSUE_STATUSES.map(({value})=>submission(revision({issue_status:value}))!);
    expect(statuses.map(status=>status.label)).toEqual(DOCUMENT_ISSUE_STATUSES.map(({value})=>value));
    expect(new Set(statuses.map(status=>status.code)).size).toBe(statuses.length);
    expect(statuses.every(status=>status.code!=="Submitted")).toBe(true);
  });
  it.each([[" Specialist issue ","Specialist issue"],["","Issue purpose not specified"],[null,"Issue purpose not specified"]])("preserves a submitted record with unknown purpose %s without inventing an approval code",(issue_status,label)=>{
    expect(submission(revision({issue_status}))).toMatchObject({code:"Submitted",label,controlStatus:"accepted"});
  });
  it("does not infer submission from a legacy state-only fixture or no revisions",()=>{
    expect(submission({state:"ready"})).toBeNull();
    expect(submission()).toBeNull();
  });
});
