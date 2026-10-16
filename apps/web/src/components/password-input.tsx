"use client";

import {useId,useState,type ComponentProps} from "react";
import {Eye,EyeOff} from "lucide-react";

type PasswordInputProps=Omit<ComponentProps<"input">,"type"> & {toggleLabel?:string};

export function PasswordInput({id,className="ev-input",disabled,toggleLabel="password",...props}:PasswordInputProps){
  const generatedId=useId();
  const inputId=id??generatedId;
  const [visible,setVisible]=useState(false);
  const label=`${visible?"Hide":"Show"} ${toggleLabel}`;
  return <div className="relative min-w-0">
    <input {...props} id={inputId} disabled={disabled} className={className} style={{...props.style,paddingRight:"3.25rem"}} type={visible?"text":"password"}/>
    <button type="button" disabled={disabled} aria-label={label} aria-controls={inputId} title={label}
      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-[#617083] hover:text-[#10243e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10243e] disabled:opacity-50"
      onClick={()=>setVisible(value=>!value)}>
      {visible?<EyeOff size={20} aria-hidden="true"/>:<Eye size={20} aria-hidden="true"/>}
    </button>
  </div>;
}
