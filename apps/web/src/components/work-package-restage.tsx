"use client";

import {useActionState,useId} from "react";
import {restageWorkPackage} from "@/app/app/work-package-staging-action";

export function WorkPackageRestage({organisationId,projectId,packageId,hasExceptions}: {
  organisationId:string;projectId:string;packageId:string;hasExceptions:boolean;
}){
  const id=useId();
  const [state,action,pending]=useActionState(restageWorkPackage,undefined);
  return <section aria-labelledby={`${id}-heading`} className="ev-card mt-4 flex min-w-0 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
    <div className="min-w-0">
      <h2 id={`${id}-heading`} className="text-base font-semibold text-[#10243e]">Revise this work package</h2>
      <p id={`${id}-description`} className="mt-1 text-sm leading-6 text-[#526675]">{hasExceptions?"Review exceptions, choose accepted revisions and exclude unissued documents in a new version. The existing ZIP stays unchanged.":"Change the selection in a new version. The existing ZIP stays unchanged."}</p>
      {state?.message&&<p role="alert" className="mt-2 text-sm text-[#8b3d1f]">{state.message}</p>}
    </div>
    <form action={action} aria-busy={pending} className="shrink-0">
      <input type="hidden" name="organisationId" value={organisationId}/>
      <input type="hidden" name="projectId" value={projectId}/>
      <input type="hidden" name="packageId" value={packageId}/>
      <button type="submit" disabled={pending} aria-describedby={`${id}-description`} className="ev-button-secondary min-h-11 w-full justify-center sm:w-auto">{pending?"Opening staging…":"Stage a new version"}</button>
    </form>
  </section>;
}
