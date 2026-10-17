type RevisionDisplayInput={state:string;control_status:string;overridden_by_revision_id?:string|null};

/** Display only: never use these labels to decide access, recovery or approval. */
export function revisionControlDisplay(revision:RevisionDisplayInput){
  if(revision.overridden_by_revision_id)return {label:"Overridden",description:null,incomplete:false};
  if(revision.state==="pending_upload"&&revision.control_status==="submitted"){
    return {label:"Upload incomplete",description:"Not yet in DCC review. Complete the upload before the submission can proceed.",incomplete:true};
  }
  return {label:revision.control_status,description:null,incomplete:false};
}

/** A registration waiting for file transfer is not a completed submission. */
export function revisionProcessingLabel(revisionState:string,runState?:string|null){
  if(revisionState==="pending_upload")return "Awaiting upload";
  return (runState??revisionState).replaceAll("_"," ");
}
