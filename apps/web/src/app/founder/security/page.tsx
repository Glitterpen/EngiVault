import {LockKeyhole} from "lucide-react";
import {FounderMfaGate} from "@/components/founder-mfa-gate";
import {requireFounderIdentity} from "@/lib/founder";

export const metadata={title:"Founder security"};

export default async function FounderSecurityPage(){
  const access=await requireFounderIdentity();
  return <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
    <div className="mb-7 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#fff0e9] text-[#df6530]"><LockKeyhole size={19}/></span><div><h1 className="text-2xl font-semibold tracking-[-.03em]">Secure founder access</h1><p className="mt-1 text-sm text-[#617083]">High-assurance verification is required for every elevated session.</p></div></div>
    <FounderMfaGate currentAal={access.current_aal}/>
  </main>;
}

