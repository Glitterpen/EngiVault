import {z} from "zod";
import type {ProjectDeliveryStage} from "@/lib/project-delivery-stage";

export const MAX_BASELINE_DOCUMENTS=1000;
export const BASELINE_ISSUE_STATUSES=["IFR","IFA","IFD","IFC"] as const;
export type BaselineIssueStatus=(typeof BASELINE_ISSUE_STATUSES)[number];
export type ProjectMilestoneBaseline={
  status:"approved"|"missing"|"scope_changed";
  baseline_id:string|null;
  baseline_version:number|null;
  approved_at:string|null;
  planned_start_date:string|null;
  planned_end_date:string|null;
  scope_hash:string|null;
  total_deliverables:number;
  total_weight:number;
  today:number|null;
  points:{date:string;planned:number}[];
  reason:string|null;
};
export type BaselineMilestone={issue_status:BaselineIssueStatus;planned_date:string|null};
export type BaselineDocument={
  document_id:string;document_number:string;title:string;discipline:string;progress_weight:number;
  planned_submission_date:string|null;planned_final_date:string|null;milestones:BaselineMilestone[];
};
export type ProjectMilestoneBaselineEditor={
  scope_hash:string;current_baseline_id:string|null;baseline_version:number|null;
  planned_start_date:string|null;planned_end_date:string|null;delivery_stage:ProjectDeliveryStage;
  revision_cycle_days:number|null;documents:BaselineDocument[];
};
export type PlannedMilestoneDocument={document_id:string;milestones:{issue_status:BaselineIssueStatus;planned_date:string}[]};

const date=z.iso.date();
const nullableDate=date.nullable();
const status=z.enum(BASELINE_ISSUE_STATUSES);
const percentage=z.number().finite().min(0).max(100);
const readerSchema=z.object({
  status:z.enum(["approved","missing","scope_changed"]),baseline_id:z.uuid().nullable(),
  baseline_version:z.number().int().positive().nullable(),approved_at:z.iso.datetime({offset:true}).nullable(),
  planned_start_date:nullableDate,planned_end_date:nullableDate,scope_hash:z.string().min(1).max(128).nullable(),
  total_deliverables:z.number().int().nonnegative(),total_weight:z.number().finite().nonnegative(),
  today:percentage.nullable(),points:z.array(z.object({date,planned:percentage})).max(5000),reason:z.string().max(1000).nullable().optional(),
});

/** Reject incomplete or malformed plans rather than inventing a planned percentage. */
export function parseProjectMilestoneBaseline(value:unknown):ProjectMilestoneBaseline|null{
  const parsed=readerSchema.safeParse(value);
  if(!parsed.success)return null;
  const result=parsed.data;
  if(result.status==="approved"&&(!result.baseline_id||!result.baseline_version||!result.approved_at||!result.planned_start_date||!result.planned_end_date||!result.scope_hash||result.total_deliverables<1||result.total_weight<=0||result.points.length<1))return null;
  if(result.planned_start_date&&result.planned_end_date&&result.planned_start_date>result.planned_end_date)return null;
  if(result.points.some((point,index)=>index>0&&(point.date<=result.points[index-1].date||point.planned<result.points[index-1].planned)))return null;
  return {...result,reason:result.reason??null};
}

const documentSchema=z.object({
  document_id:z.uuid(),document_number:z.string().min(1).max(300),title:z.string().max(3000),discipline:z.string().min(1).max(300),
  progress_weight:z.number().finite().positive(),planned_submission_date:nullableDate,planned_final_date:nullableDate,
  milestones:z.array(z.object({issue_status:status,planned_date:nullableDate})).min(2).max(4),
});
const editorSchema=z.object({
  scope_hash:z.string().min(1).max(128),current_baseline_id:z.uuid().nullable(),baseline_version:z.number().int().positive().nullable(),
  planned_start_date:nullableDate,planned_end_date:nullableDate,delivery_stage:z.enum(["concept","feed","ded"]),
  revision_cycle_days:z.number().int().min(1).max(365).nullable(),documents:z.array(documentSchema).max(MAX_BASELINE_DOCUMENTS),
});

export function baselineStageMilestones(stage:ProjectDeliveryStage):BaselineIssueStatus[]{
  return stage==="concept"?["IFR","IFA"]:stage==="ded"?["IFR","IFA","IFC"]:["IFR","IFA","IFD"];
}

export function parseProjectMilestoneBaselineEditor(value:unknown):ProjectMilestoneBaselineEditor|null{
  const parsed=editorSchema.safeParse(value);
  if(!parsed.success)return null;
  const result=parsed.data,expected=baselineStageMilestones(result.delivery_stage);
  if(new Set(result.documents.map(document=>document.document_id)).size!==result.documents.length)return null;
  if(result.documents.some(document=>document.milestones.length!==expected.length||document.milestones.some((milestone,index)=>milestone.issue_status!==expected[index])))return null;
  return result;
}

export function validateBaselineDates(editor:ProjectMilestoneBaselineEditor,documents:readonly {document_id:string;milestones:readonly BaselineMilestone[]}[]):string[]{
  const errors:string[]=[];
  if(!editor.planned_start_date||!editor.planned_end_date||editor.planned_start_date>editor.planned_end_date)errors.push("Set valid project start and completion dates before approving a baseline.");
  if(!documents.length)errors.push("Add active MDR deliverables before approving a baseline.");
  const expected=baselineStageMilestones(editor.delivery_stage);
  const names=new Map(editor.documents.map(document=>[document.document_id,document.document_number]));
  for(const document of documents){
    const label=names.get(document.document_id)??"Deliverable";
    if(document.milestones.length!==expected.length||document.milestones.some((milestone,index)=>milestone.issue_status!==expected[index])){errors.push(`${label}: include every required issue milestone.`);continue;}
    let previous:string|null=null;
    for(const milestone of document.milestones){
      if(!milestone.planned_date||!date.safeParse(milestone.planned_date).success){errors.push(`${label}: set the ${milestone.issue_status} date.`);continue;}
      if(editor.planned_start_date&&milestone.planned_date<editor.planned_start_date||editor.planned_end_date&&milestone.planned_date>editor.planned_end_date)errors.push(`${label}: ${milestone.issue_status} must be inside the project timeline.`);
      if(previous&&milestone.planned_date<previous)errors.push(`${label}: milestone dates must follow issue order.`);
      previous=milestone.planned_date;
    }
  }
  return errors;
}

export const plannedMilestonesSchema=z.array(z.object({
  document_id:z.uuid(),milestones:z.array(z.object({issue_status:status,planned_date:date}).strict()).min(2).max(4),
}).strict()).min(1).max(MAX_BASELINE_DOCUMENTS).superRefine((documents,context)=>{
  if(new Set(documents.map(document=>document.document_id)).size!==documents.length)context.addIssue({code:"custom",message:"Each deliverable must appear once."});
  for(const document of documents){
    if(new Set(document.milestones.map(milestone=>milestone.issue_status)).size!==document.milestones.length)context.addIssue({code:"custom",message:"Milestones must not be duplicated."});
    if(document.milestones.some((milestone,index)=>index>0&&milestone.planned_date<document.milestones[index-1].planned_date))context.addIssue({code:"custom",message:"Milestone dates must follow issue order."});
  }
});
