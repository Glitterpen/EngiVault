import {projectIssueProgressCredit,type ProjectDeliveryStage} from "@/lib/project-delivery-stage";

export type AcceptedProgressRevision = {
  document_id:string;
  issue_status:string;
  state:string;
  control_status:string;
  id?:string;
  created_at?:string|null;
  reviewed_at?:string|null;
  overridden_by_revision_id?:string|null;
};

/**
 * Earned progress is the highest completed, DCC-accepted milestone still in
 * effect. This does not choose the latest submission, change revision order,
 * or make an incomplete, returned or overridden file count as accepted work.
 * Callers must supply only rows their existing document scope/RLS permits.
 */
export function highestAcceptedProgressByDocument<T extends AcceptedProgressRevision>(
  revisions:readonly T[],deliveryStage:ProjectDeliveryStage,
):Map<string,T>{
  const accepted=new Map<string,T>();
  for(const revision of revisions){
    if(revision.control_status!=="accepted"
      ||(revision.state!=="ready"&&revision.state!=="superseded")
      ||revision.overridden_by_revision_id!=null)continue;
    const previous=accepted.get(revision.document_id);
    if(!previous||compareAcceptedProgress(revision,previous,deliveryStage)>0){
      accepted.set(revision.document_id,revision);
    }
  }
  return accepted;
}

function compareAcceptedProgress(
  candidate:AcceptedProgressRevision,previous:AcceptedProgressRevision,stage:ProjectDeliveryStage,
){
  return projectIssueProgressCredit(candidate.issue_status,stage)-projectIssueProgressCredit(previous.issue_status,stage)
    ||timestamp(candidate.reviewed_at??candidate.created_at)-timestamp(previous.reviewed_at??previous.created_at)
    ||timestamp(candidate.created_at)-timestamp(previous.created_at)
    ||compareId(candidate.id??"",previous.id??"");
}

function timestamp(value:string|null|undefined){
  const parsed=value?Date.parse(value):Number.NaN;
  return Number.isFinite(parsed)?parsed:0;
}

function compareId(candidate:string,previous:string){
  return candidate===previous?0:candidate>previous?1:-1;
}
