"use client";

import {cloneElement,useId,type AriaAttributes,type ReactElement,type ReactNode} from "react";
import {HelpTip} from "@/components/help-tip";

type FieldControlProps=Pick<AriaAttributes,"aria-describedby"|"aria-invalid">&{id?:string};
export type FormFieldProps={
  label:ReactNode;
  children:ReactElement<FieldControlProps>;
  id?:string;
  description?:ReactNode;
  error?:ReactNode;
  help?:{label:string;content:ReactNode};
  className?:string;
};

/** Adds label/error relationships only; the control owns its value and validation. */
export function FormField({label,children,id,description,error,help,className=""}:FormFieldProps){
  const generatedId=useId();
  const controlId=id??children.props.id??generatedId;
  const hasDescription=description!==undefined&&description!==null&&description!==false&&description!=="";
  const hasError=error!==undefined&&error!==null&&error!==false&&error!=="";
  const descriptions=[children.props["aria-describedby"],hasDescription?`${controlId}-description`:undefined,hasError?`${controlId}-error`:undefined]
    .filter((value):value is string=>Boolean(value)).flatMap(value=>value.split(/\s+/).filter(Boolean));
  const describedBy=[...new Set(descriptions)].join(" ")||undefined;
  const control=cloneElement(children,{id:controlId,"aria-describedby":describedBy,"aria-invalid":hasError?true:children.props["aria-invalid"]});
  return <div className={`min-w-0 ${className}`.trim()}>
    <div className="mb-1.5 flex min-w-0 items-center gap-1">
      <label htmlFor={controlId} className="ev-label mb-0 min-w-0 [overflow-wrap:anywhere]">{label}</label>
      {help&&<HelpTip label={help.label}>{help.content}</HelpTip>}
    </div>
    {control}
    {hasDescription&&<div id={`${controlId}-description`} className="mt-1.5 text-xs leading-5 text-[#526675] [overflow-wrap:anywhere]">{description}</div>}
    {hasError&&<div id={`${controlId}-error`} role="alert" className="mt-1.5 text-xs leading-5 text-[#a5452f] [overflow-wrap:anywhere]">{error}</div>}
  </div>;
}
