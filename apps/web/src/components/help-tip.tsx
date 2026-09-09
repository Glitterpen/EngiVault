"use client";

import {CircleHelp} from "lucide-react";
import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from "react";

/** Optional guidance only: errors, required actions and destructive warnings stay visible. */
export function HelpTip({label,children,className=""}:{label:string;children:ReactNode;className?:string}) {
  const id=useId();
  const trigger=useRef<HTMLButtonElement>(null);
  const popup=useRef<HTMLSpanElement>(null);
  const closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const pinned=useRef(false);
  const [open,setOpen]=useState(false);
  const cancelClose=useCallback(()=>{if(closeTimer.current)clearTimeout(closeTimer.current);},[]);
  const show=()=>{cancelClose();setOpen(true);};
  const close=useCallback(()=>{cancelClose();pinned.current=false;setOpen(false);},[cancelClose]);
  const leave=()=>{
    cancelClose();
    closeTimer.current=setTimeout(()=>{
      if(!pinned.current&&document.activeElement!==trigger.current)setOpen(false);
    },150);
  };

  useEffect(()=>()=>{if(closeTimer.current)clearTimeout(closeTimer.current);},[]);
  useLayoutEffect(()=>{
    if(!open)return;
    const tip=popup.current;
    if(!tip)return;
    // The top layer keeps help visible inside scrolling panels and native dialogs.
    if(typeof tip.showPopover==="function")tip.showPopover();
    else tip.removeAttribute("popover");
    const position=()=>{
      const anchor=trigger.current?.getBoundingClientRect();
      if(!anchor)return;
      const gap=8;
      const width=Math.max(0,window.innerWidth-gap*2);
      tip.style.width=`${Math.min(360,width)}px`;
      const below=window.innerHeight-anchor.bottom-gap*2;
      const above=anchor.top-gap*2;
      const bottom=below>=Math.min(tip.scrollHeight,240)||below>=above;
      tip.style.maxHeight=`${Math.max(0,bottom?below:above)}px`;
      const box=tip.getBoundingClientRect();
      tip.style.left=`${Math.max(gap,Math.min(anchor.left+anchor.width/2-box.width/2,window.innerWidth-box.width-gap))}px`;
      tip.style.top=`${Math.max(gap,bottom?anchor.bottom+gap:anchor.top-box.height-gap)}px`;
    };
    position();
    const outside=(event:PointerEvent)=>{
      if(event.target instanceof Node&&!trigger.current?.contains(event.target)&&!tip.contains(event.target))close();
    };
    const escape=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();}
    };
    document.addEventListener("pointerdown",outside);
    document.addEventListener("keydown",escape,true);
    window.addEventListener("resize",position);
    window.addEventListener("scroll",position,true);
    return()=>{
      document.removeEventListener("pointerdown",outside);
      document.removeEventListener("keydown",escape,true);
      window.removeEventListener("resize",position);
      window.removeEventListener("scroll",position,true);
    };
  },[open,close]);

  return <span className={`ev-help inline-flex shrink-0 align-middle ${className}`}>
    <button ref={trigger} type="button" data-preview-safe aria-label={label} aria-expanded={open} aria-describedby={open?id:undefined}
      className="ev-help-trigger" onMouseEnter={show} onMouseLeave={leave} onFocus={show}
      onBlur={event=>{if(!popup.current?.contains(event.relatedTarget)){close();}}}
      onClick={event=>{event.preventDefault();event.stopPropagation();if(pinned.current)close();else{pinned.current=true;show();}}}>
      <CircleHelp size={17} aria-hidden="true"/>
    </button>
    {open&&<span ref={popup} id={id} role="tooltip" popover="manual" className="ev-help-popup"
      onMouseEnter={show} onMouseLeave={leave} onClick={event=>event.stopPropagation()}>{children}</span>}
  </span>;
}
