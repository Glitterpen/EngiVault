import type {ReactNode} from "react";

type Props={title:string;context:ReactNode;logo?:ReactNode;help?:ReactNode;actions?:ReactNode};

/** One clear page title, with the full workspace identity kept in supporting text. */
export function WorkspacePageHeading({title,context,logo,help,actions}:Props){
  return <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-5 gap-y-3 sm:items-center">
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {logo&&<span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#dfe7e3] bg-white p-1.5">{logo}</span>}
      <div className="min-w-0">
        <div className="flex min-w-0 items-start gap-1.5"><h1 className="min-w-0 break-words text-2xl font-semibold leading-tight tracking-tight text-[#10243e] sm:text-[1.75rem]">{title}</h1>{help&&<span className="inline-flex shrink-0 items-center pt-0.5">{help}</span>}</div>
        <p className="mt-1 break-words text-sm leading-6 text-[#526675]">{context}</p>
      </div>
    </div>
    {actions&&<div className="flex w-full shrink-0 flex-wrap items-center gap-2 [&>a]:w-full [&>button]:w-full sm:w-auto sm:[&>a]:w-auto sm:[&>button]:w-auto">{actions}</div>}
  </div>;
}
