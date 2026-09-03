"use client";

import Script from "next/script";
import {useCallback,useEffect,useRef,useState} from "react";

type TurnstileWidgetOptions={
  sitekey:string;
  theme?:"light"|"dark"|"auto";
  callback?:(token:string)=>void;
  "expired-callback"?:()=>void;
  "error-callback"?:()=>void;
  "timeout-callback"?:()=>void;
};

type TurnstileApi={
  render:(container:HTMLElement,options:TurnstileWidgetOptions)=>string;
  reset:(widgetId?:string)=>void;
  remove:(widgetId:string)=>void;
};

declare global {
  interface Window {
    turnstile?:TurnstileApi;
  }
}

export function AuthTurnstile({siteKey,resetKey,onTokenChange}:{siteKey?:string;resetKey:number;onTokenChange:(token:string)=>void}){
  const containerRef=useRef<HTMLDivElement>(null);
  const widgetIdRef=useRef<string|undefined>(undefined);
  const lastResetKeyRef=useRef(resetKey);
  const [error,setError]=useState<string>();
  const configuredSiteKey=siteKey?.trim();

  const clearToken=useCallback(()=>onTokenChange(""),[onTokenChange]);
  const renderWidget=useCallback(()=>{
    if(!configuredSiteKey||!containerRef.current||!window.turnstile||widgetIdRef.current)return;
    setError(undefined);
    widgetIdRef.current=window.turnstile.render(containerRef.current,{
      sitekey:configuredSiteKey,
      theme:"auto",
      callback:(token)=>{
        setError(undefined);
        onTokenChange(token);
      },
      "expired-callback":clearToken,
      "timeout-callback":clearToken,
      "error-callback":()=>{
        clearToken();
        setError("Security verification could not load. Check your connection and try again.");
      },
    });
  },[clearToken,configuredSiteKey,onTokenChange]);

  useEffect(()=>{
    renderWidget();
    return ()=>{
      if(widgetIdRef.current&&window.turnstile){
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current=undefined;
      }
    };
  },[renderWidget]);

  useEffect(()=>{
    if(lastResetKeyRef.current===resetKey)return;
    lastResetKeyRef.current=resetKey;
    clearToken();
    setError(undefined);
    if(widgetIdRef.current&&window.turnstile)window.turnstile.reset(widgetIdRef.current);
  },[clearToken,resetKey]);

  if(!configuredSiteKey)return null;

  return <div className="space-y-2">
    <Script
      id="cloudflare-turnstile-auth"
      src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      strategy="afterInteractive"
      onReady={renderWidget}
      onError={()=>setError("Security verification could not load. Check your connection and try again.")}
    />
    <div ref={containerRef} className="min-h-[65px] overflow-hidden rounded-lg"/>
    {error&&<p className="text-xs leading-5 text-red-700" role="alert">{error}</p>}
  </div>;
}
