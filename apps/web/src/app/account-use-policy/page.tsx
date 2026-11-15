import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { RegistrationPolicyDocument } from "@/components/registration-policy-document";
import { REGISTRATION_POLICY_DISPLAY_VERSION } from "@/lib/account-use-acknowledgement";
import { REGISTRATION_POLICY_INTRO } from "@/lib/registration-policy-content";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Policy, Security and Data Protection",
  description: "EngiCite’s registration policy, security safeguards and data protection information.",
  robots: { index: false, follow: false },
};

export default function AccountUsePolicyPage() {
  return (
    <main className={`${styles.policyPage} min-h-screen bg-[#f6f8fb] px-4 py-6 sm:px-6 sm:py-10`}>
      <div className="mx-auto max-w-[60rem]">
        <header className="mb-5"><Brand /></header>
        <article aria-labelledby="registration-policy-title" className="rounded-2xl border border-[#d6e0ed] bg-white px-4 py-6 sm:p-9">
          <div className="mb-6 border-b border-[#d6e0ed] pb-5">
            <p className="text-xs font-semibold text-[#526675]">Draft for review · {REGISTRATION_POLICY_DISPLAY_VERSION}</p>
            <h1 id="registration-policy-title" className="mt-2 text-[1.375rem] font-semibold leading-tight tracking-tight text-[#10243e] sm:text-[1.75rem]">Policy, Security and Data Protection</h1>
            <p className="mt-2 max-w-[68ch] text-sm leading-[1.6] text-[#526675]">{REGISTRATION_POLICY_INTRO}</p>
          </div>
          <RegistrationPolicyDocument idPrefix="policy-page" layout="sidebar" />
        </article>
      </div>
    </main>
  );
}
