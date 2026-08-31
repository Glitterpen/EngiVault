"use client";

import Image from "next/image";
import {useEffect,useMemo,useState} from "react";
import {CheckCircle2,KeyRound,LoaderCircle,ShieldCheck,Smartphone} from "lucide-react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/browser";

type Factor={id:string;status:string;friendly_name?:string;factor_type?:string};
type Enrollment={id:string;qrCode:string;secret:string};

export function FounderMfaGate({currentAal}:{currentAal:string}){
  const supabase=useMemo(()=>createClient(),[]);
  const router=useRouter();
  const [factor,setFactor]=useState<Factor|null>(null);
  const [enrollment,setEnrollment]=useState<Enrollment|null>(null);
  const [code,setCode]=useState("");
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [message,setMessage]=useState<string|null>(null);

  useEffect(()=>{
    let active=true;
    supabase.auth.mfa.listFactors().then(({data,error})=>{
      if(!active)return;
      if(error)setMessage("Authenticator security could not be checked. Refresh and try again.");
      else setFactor((data.all as Factor[]).find(item=>item.factor_type==="totp"&&item.status==="verified")??null);
      setLoading(false);
    });
    return()=>{active=false};
  },[supabase]);

  async function beginEnrollment(){
    setSubmitting(true);setMessage(null);
    const factors=await supabase.auth.mfa.listFactors();
    for(const stale of (factors.data?.all??[]) as Factor[]){
      if(stale.factor_type==="totp"&&stale.status!=="verified")await supabase.auth.mfa.unenroll({factorId:stale.id});
    }
    const {data,error}=await supabase.auth.mfa.enroll({factorType:"totp",friendlyName:"EngiCite Founder Control Centre"});
    if(error){setMessage(error.message);setSubmitting(false);return}
    setEnrollment({id:data.id,qrCode:data.totp.qr_code,secret:data.totp.secret});
    setSubmitting(false);
  }

  async function verify(){
    const factorId=enrollment?.id??factor?.id;
    if(!factorId||!/^\d{6}$/.test(code)){setMessage("Enter the current 6-digit code from your authenticator app.");return}
    setSubmitting(true);setMessage(null);
    const challenge=await supabase.auth.mfa.challenge({factorId});
    if(challenge.error){setMessage(challenge.error.message);setSubmitting(false);return}
    const verification=await supabase.auth.mfa.verify({factorId,challengeId:challenge.data.id,code});
    if(verification.error){setMessage("That code was not accepted. Wait for a new code and try again.");setSubmitting(false);return}
    router.replace("/founder");
    router.refresh();
  }

  if(currentAal==="aal2")return <div className="ev-card p-7 text-center"><CheckCircle2 className="mx-auto text-[#0c684e]" size={32}/><h2 className="mt-3 text-xl font-semibold">Founder session verified</h2><p className="mt-2 text-sm text-[#617083]">Your high-assurance session is ready.</p><button onClick={()=>router.replace("/founder")} className="ev-button mt-5">Open control centre</button></div>;

  return <div className="ev-card overflow-hidden">
    <div className="border-b border-[#e2e8ee] bg-[#f8fafc] p-6 sm:p-8"><div className="flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#10243e] text-white"><ShieldCheck size={23}/></span><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#e8733f]">Step-up security</p><h2 className="mt-1 text-xl font-semibold">Verify with an authenticator app</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#617083]">Founder access contains cross-organisation business and account information. A password alone is not sufficient.</p></div></div></div>
    <div className="p-6 sm:p-8">
      {loading?<p className="flex items-center gap-2 text-sm text-[#617083]"><LoaderCircle className="animate-spin" size={17}/> Checking your security factors…</p>:!factor&&!enrollment?<div><p className="text-sm leading-6 text-[#526276]">Use Microsoft Authenticator, Google Authenticator, 1Password or another TOTP app. EngiCite will never ask you to send these codes by email.</p><button onClick={beginEnrollment} disabled={submitting} className="ev-button mt-5"><Smartphone size={17}/>{submitting?"Preparing…":"Set up authenticator"}</button></div>:<div className="grid gap-7 lg:grid-cols-[auto_1fr]">
        {enrollment&&<div className="rounded-2xl border border-[#dce4ea] bg-white p-4 text-center"><Image src={enrollment.qrCode} alt="Authenticator enrolment QR code" width={210} height={210} unoptimized className="mx-auto size-[210px]"/><p className="mt-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#65758a]">Manual setup key</p><code className="mt-1 block max-w-[250px] break-all rounded-lg bg-[#f4f7f9] p-2 text-xs text-[#10243e]">{enrollment.secret}</code></div>}
        <div className="self-center"><div className="flex items-center gap-2 text-[#10243e]"><KeyRound size={18}/><h3 className="font-semibold">{factor?"Enter your verification code":"Scan, then verify"}</h3></div><p className="mt-2 text-sm leading-6 text-[#617083]">Enter the six digits currently shown in your authenticator app.</p><label className="mt-5 block max-w-xs"><span className="ev-label">6-digit code</span><input value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" autoComplete="one-time-code" className="ev-input text-center text-lg tracking-[.3em]" placeholder="000000"/></label><button onClick={verify} disabled={submitting||code.length!==6} className="ev-button mt-4">{submitting?<><LoaderCircle className="animate-spin" size={17}/> Verifying…</>:<><ShieldCheck size={17}/> Verify and continue</>}</button></div>
      </div>}
      {message&&<p role="alert" className="mt-5 rounded-xl border border-[#efc1bd] bg-[#fff3f1] p-3 text-sm text-[#9d3b34]">{message}</p>}
    </div>
  </div>;
}

