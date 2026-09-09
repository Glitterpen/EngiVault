"use client";

import {cloneElement,useId,type ReactElement,type ReactNode} from "react";
import {HelpTip} from "@/components/help-tip";

/** Keeps a help button outside the field's label and preserves an explicit label association. */
export function FieldWithHelp({label,help,children,className="",helpLabel}:{label:ReactNode;help:ReactNode;children:ReactElement<{id?:string}>;className?:string;helpLabel:string}) {
  const generatedId=useId();
  const id=children.props.id??generatedId;
  return <div className={className}>
    <div className="mb-2 flex items-center gap-1">
      <label htmlFor={id} className="ev-label mb-0">{label}</label>
      <HelpTip label={helpLabel}>{help}</HelpTip>
    </div>
    {cloneElement(children,{id})}
  </div>;
}
