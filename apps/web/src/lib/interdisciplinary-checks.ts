import {z} from "zod";

export const interdisciplinaryScope=z.object({organisationId:z.uuid(),projectId:z.uuid(),revisionId:z.uuid()});
export const interdisciplinaryCheckSchema=interdisciplinaryScope.extend({
  decision:z.enum(["signed_off","changes_requested"]),
  reviewed:z.literal("yes"),
  comment:z.string().trim().max(2000).default(""),
}).refine(value=>value.decision!=="changes_requested"||value.comment.length>=5,{path:["comment"],message:"Explain the changes required."});
export const canRecordInterdisciplinaryCheck=(role:string)=>["engineer","project_admin","document_controller"].includes(role);
export const interdisciplinaryDecisionLabel={signed_off:"Signed off",changes_requested:"Changes requested"};
export type InterdisciplinaryDocument={document_id:string;document_number:string;title:string;discipline:string;document_type:string;revision_id:string;revision_code:string;issue_status:string;issue_date:string|null;reviewed_at:string|null};
export type InterdisciplinaryLibrary={total:number;disciplines:string[];documents:InterdisciplinaryDocument[]};
export type InterdisciplinaryRevision={documentId:string;documentNumber:string;title:string;discipline:string;documentType:string;revisionId:string;revisionCode:string;issueStatus:string;issueDate:string|null;approvedAt:string|null;filename:string;hasNative:boolean;isCurrent:boolean;canSignOff:boolean;checks:{id:string;decision:"signed_off"|"changes_requested";comment:string;reviewer_role:string;reviewer_disciplines:string[];created_at:string;reviewer_name:string;is_mine:boolean;is_latest:boolean}[]};

export function referenceDate(value:string|null){return value?new Date(value.length===10?`${value}T00:00:00Z`:value).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}):"Not recorded";}
