import {describe,expect,it} from "vitest";
import {revisionControlDisplay,revisionProcessingLabel} from "./revision-display-status";

describe("revision display status",()=>{
  it("clearly distinguishes an incomplete upload registration from DCC submission",()=>{
    const revision={state:"pending_upload",control_status:"submitted"};
    expect(revisionControlDisplay(revision)).toEqual({label:"Upload incomplete",description:"Not yet in DCC review. Complete the upload before the submission can proceed.",incomplete:true});
    expect(revision).toEqual({state:"pending_upload",control_status:"submitted"});
  });
  it.each(["quarantined","queued","processing","ready","failed","superseded"])("keeps completed upload control labels unchanged for %s",state=>{
    expect(revisionControlDisplay({state,control_status:"submitted"})).toEqual({label:"submitted",description:null,incomplete:false});
  });
  it.each(["accepted","returned","cancelled"])("does not relabel a %s control decision",control_status=>{
    expect(revisionControlDisplay({state:"pending_upload",control_status})).toEqual({label:control_status,description:null,incomplete:false});
  });
  it("preserves overridden-history priority",()=>{
    expect(revisionControlDisplay({state:"pending_upload",control_status:"submitted",overridden_by_revision_id:"replacement"})).toEqual({label:"Overridden",description:null,incomplete:false});
  });
  it("does not let a stale processing run imply that a pending transfer has finished",()=>{
    expect(revisionProcessingLabel("pending_upload","ready")).toBe("Awaiting upload");
    expect(revisionProcessingLabel("pending_upload")).toBe("Awaiting upload");
  });
  it.each(["ready","queued","failed","dead_letter"])("retains the exact %s processing state after upload",state=>{
    expect(revisionProcessingLabel("processing",state)).toBe(state.replaceAll("_"," "));
  });
});
