import {describe,expect,it} from "vitest";
import {baselineStageMilestones,MAX_BASELINE_DOCUMENTS,parseProjectMilestoneBaseline,parseProjectMilestoneBaselineEditor,plannedMilestonesSchema,validateBaselineDates,type ProjectMilestoneBaselineEditor} from "./project-milestone-baseline";

const id="a0000000-0000-4000-8000-000000000001";
const reader={status:"approved",baseline_id:id,baseline_version:1,approved_at:"2026-10-18T12:00:00+00:00",planned_start_date:"2026-10-01",planned_end_date:"2026-11-01",scope_hash:"scope",total_deliverables:1,total_weight:2,today:33,points:[{date:"2026-10-01",planned:0},{date:"2026-11-01",planned:100}],reason:null};
const editor:ProjectMilestoneBaselineEditor={scope_hash:"scope",current_baseline_id:null,baseline_version:null,planned_start_date:"2026-10-01",planned_end_date:"2026-11-01",delivery_stage:"feed",revision_cycle_days:3,documents:[{document_id:id,document_number:"DOC-001",title:"Design",discipline:"Electrical",progress_weight:2,planned_submission_date:"2026-10-05",planned_final_date:"2026-10-20",milestones:[{issue_status:"IFR",planned_date:"2026-10-05"},{issue_status:"IFA",planned_date:"2026-10-12"},{issue_status:"IFD",planned_date:"2026-10-20"}]}]};

describe("approved milestone baseline reader",()=>{
  it("reads the frozen weighted plan without calculating or changing actual progress",()=>{expect(parseProjectMilestoneBaseline(reader)).toEqual(reader);});
  it.each(["missing","scope_changed"])("preserves an explicit unavailable comparison (%s) without substituting zero",status=>{
    const value={...reader,status,today:null,points:[],baseline_id:null,baseline_version:null,approved_at:null,reason:"Review required"};
    expect(parseProjectMilestoneBaseline(value)).toEqual(value);
  });
  it.each([null,{},[],{...reader,status:"unknown"},{...reader,today:-1},{...reader,today:101},{...reader,today:Number.NaN},{...reader,today:"33"},{...reader,total_weight:Infinity},{...reader,baseline_id:null},{...reader,baseline_version:null},{...reader,approved_at:null},{...reader,planned_start_date:null},{...reader,scope_hash:null},{...reader,total_deliverables:0},{...reader,total_weight:0},{...reader,points:[]}])("fails closed for malformed reader value %#",value=>{expect(parseProjectMilestoneBaseline(value)).toBeNull();});
  it.each([
    [{date:"2026-10-31",planned:90},{date:"2026-10-01",planned:100}],
    [{date:"2026-10-01",planned:90},{date:"2026-10-31",planned:33}],
    [{date:"2026-10-01",planned:0},{date:"2026-10-01",planned:100}],
    [{date:"2026-02-30",planned:0}],
  ].map(points=>({points})))("rejects unordered, decreasing, duplicate or invalid dates %#",({points})=>{expect(parseProjectMilestoneBaseline({...reader,points})).toBeNull();});
});

describe("baseline editor plan validation",()=>{
  it("accepts only stage-specific issue milestones and retains captured weights",()=>{expect(parseProjectMilestoneBaselineEditor(editor)).toEqual(editor);expect(baselineStageMilestones("concept")).toEqual(["IFR","IFA"]);expect(baselineStageMilestones("ded")).toEqual(["IFR","IFA","IFC"]);});
  it("keeps missing suggested dates as null, not invented dates",()=>{expect(parseProjectMilestoneBaselineEditor({...editor,documents:[{...editor.documents[0],milestones:editor.documents[0].milestones.map(milestone=>({...milestone,planned_date:null}))}]})).not.toBeNull();});
  it("rejects duplicate document identifiers and incompatible milestone sequences",()=>{
    expect(parseProjectMilestoneBaselineEditor({...editor,documents:[editor.documents[0],editor.documents[0]]})).toBeNull();
    expect(parseProjectMilestoneBaselineEditor({...editor,delivery_stage:"ded"})).toBeNull();
    expect(parseProjectMilestoneBaselineEditor({...editor,documents:[{...editor.documents[0],progress_weight:0}]})).toBeNull();
  });
  it("enforces the complete supported scope cap rather than silently truncating",()=>{expect(MAX_BASELINE_DOCUMENTS).toBe(1000);expect(parseProjectMilestoneBaselineEditor({...editor,documents:Array.from({length:1001},()=>editor.documents[0])})).toBeNull();});
  it("validates every document, including rows on another UI page",()=>{
    const documents=[...editor.documents,{...editor.documents[0],document_id:"a0000000-0000-4000-8000-000000000002",milestones:[{issue_status:"IFR" as const,planned_date:null},{issue_status:"IFA" as const,planned_date:"2026-11-02"},{issue_status:"IFD" as const,planned_date:"2026-10-03"}]}];
    const errors=validateBaselineDates({...editor,documents},documents);
    expect(errors).toContain("DOC-001: set the IFR date.");expect(errors.some(error=>error.includes("inside the project timeline"))).toBe(true);expect(errors.some(error=>error.includes("issue order"))).toBe(true);
  });
  it("accepts equal-date milestones and never changes the input data",()=>{const copy=structuredClone(editor);const plan=editor.documents.map(document=>({...document,milestones:document.milestones.map(milestone=>({...milestone,planned_date:"2026-10-05"}))}));expect(validateBaselineDates(editor,plan)).toEqual([]);expect(editor).toEqual(copy);});
  it("requires a valid project timeline and active MDR scope",()=>{expect(validateBaselineDates({...editor,planned_start_date:null},editor.documents)).toContain("Set valid project start and completion dates before approving a baseline.");expect(validateBaselineDates(editor,[])).toContain("Add active MDR deliverables before approving a baseline.");});
  it("rejects payload extras, duplicates, missing or out-of-sequence dates",()=>{
    const plan=editor.documents.map(({document_id,milestones})=>({document_id,milestones}));
    expect(plannedMilestonesSchema.safeParse(plan).success).toBe(true);
    expect(plannedMilestonesSchema.safeParse([...plan,...plan]).success).toBe(false);
    expect(plannedMilestonesSchema.safeParse([{...plan[0],progress_weight:900}]).success).toBe(false);
    expect(plannedMilestonesSchema.safeParse([{...plan[0],milestones:[plan[0].milestones[2],plan[0].milestones[0]]}]).success).toBe(false);
    expect(plannedMilestonesSchema.safeParse([{...plan[0],milestones:[{issue_status:"IFR",planned_date:null},plan[0].milestones[1]]}]).success).toBe(false);
  });
});
