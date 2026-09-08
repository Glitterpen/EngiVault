import {z} from "zod";

export const requestScope=z.object({organisationId:z.uuid(),projectId:z.uuid()});
export const requestDate=z.iso.date().refine(value=>{
  const date=new Date(`${value}T00:00:00Z`);
  const today=new Date();today.setUTCHours(0,0,0,0);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value&&date>=today&&date.getTime()<=today.getTime()+3650*86400000;
},"Choose today or a future date within ten years.");
const reason=z.string().trim().min(5).max(2000);
export const newDeliverableRequest=z.discriminatedUnion("kind",[
  requestScope.extend({kind:z.literal("date_change"),documentId:z.uuid(),requestedDate:requestDate,reason}),
  requestScope.extend({kind:z.literal("additional_deliverable"),title:z.string().trim().min(2).max(240),documentType:z.string().trim().min(1).max(80),discipline:z.string().trim().min(1).max(80),requestedDate:requestDate,reason}),
]);
export const reviewDeliverableRequestSchema=requestScope.extend({requestId:z.uuid(),decision:z.enum(["approve","reject"]),comment:z.string().trim().max(2000).default(""),documentNumber:z.string().trim().max(80).default("")})
  .refine(value=>value.decision!=="reject"||value.comment.length>=5,{message:"Give a reason for rejection (at least 5 characters).",path:["comment"]});
export type DeliverableRequest={
  id:string;kind:"date_change"|"additional_deliverable";status:"pending_pm"|"pending_dcc"|"accepted"|"rejected"|"cancelled"|"superseded";
  requester_id:string|null;document_id:string|null;document_number:string|null;title:string;document_type:string;discipline:string;
  requested_date:string;previous_due_date:string|null;reason:string;created_at:string;
  pm_reviewed_at:string|null;pm_comment:string|null;dcc_reviewed_at:string|null;dcc_comment:string|null;
};
export const requestStatusLabel:Record<DeliverableRequest["status"],string>={pending_pm:"Awaiting PM approval",pending_dcc:"Awaiting DCC acceptance",accepted:"Accepted by DCC",rejected:"Rejected",cancelled:"Cancelled",superseded:"Superseded · submit a fresh request"};
export function canReviewDeliverableRequest(role:string,request:Pick<DeliverableRequest,"status"|"requester_id">,userId:string,readOnly=false){
  return !readOnly&&request.requester_id!==userId&&((role==="project_admin"&&request.status==="pending_pm")||(role==="document_controller"&&request.status==="pending_dcc"));
}
