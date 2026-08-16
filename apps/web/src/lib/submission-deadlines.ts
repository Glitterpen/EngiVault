const receivedStates=new Set(["quarantined","processing","ready","failed","superseded"]);

export function hasReceivedSubmission(states:readonly string[]):boolean{
  return states.some(state=>receivedStates.has(state));
}

export function isSubmissionOverdue(plannedDate:string|null,revisionStates:readonly string[],today:string):boolean{
  return Boolean(plannedDate&&plannedDate<today&&!hasReceivedSubmission(revisionStates));
}
