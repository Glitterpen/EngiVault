import type {ReactNode} from "react";

export type FormFeedbackTone="success"|"error"|"info";
type FormFeedbackProps={tone:FormFeedbackTone;children:ReactNode;className?:string;id?:string};

const tones:Record<FormFeedbackTone,string>={
  success:"border-[#d6e0ed] bg-[#eef3fa] text-[#24384f]",
  error:"border-[#f0c8b7] bg-[#fff6f2] text-[#8b3d1f]",
  info:"border-[#d6e0ed] bg-[#f7f9fc] text-[#526675]",
};

/** Callers supply the known result; wording never determines success or failure. */
export function FormFeedback({tone,children,className="",id}:FormFeedbackProps){
  return <div id={id} role={tone==="error"?"alert":"status"} aria-atomic="true" className={`min-w-0 rounded-xl border p-3 text-sm leading-6 [overflow-wrap:anywhere] ${tones[tone]} ${className}`.trim()}>{children}</div>;
}
