"use client";

import { type RefObject, useEffect, useRef } from "react";
import { RegistrationPolicyDocument } from "@/components/registration-policy-document";
import {
  ACCOUNT_USE_ACKNOWLEDGEMENT_FIELD,
  ACCOUNT_USE_ACKNOWLEDGEMENT_VERSION,
  REGISTRATION_DECLARATION_FIELD,
  REGISTRATION_DECLARATIONS,
  REGISTRATION_POLICY_DISPLAY_VERSION,
  REGISTRATION_POLICY_LABEL,
} from "@/lib/account-use-acknowledgement";

type RegistrationPolicyDialogProps = {
  id: string;
  audience: keyof typeof REGISTRATION_DECLARATIONS;
  opener: RefObject<HTMLButtonElement | null>;
  busy: boolean;
  captchaIncomplete: boolean;
  onDismiss: () => void;
  policyError?: string;
  declarationError?: string;
};

export function RegistrationPolicyDialog({
  id, audience, opener, busy, captchaIncomplete, onDismiss, policyError, declarationError,
}: RegistrationPolicyDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const declaration = REGISTRATION_DECLARATIONS[audience];

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const trigger = opener.current;
    if (!element.open) element.showModal();
    heading.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (element.open) element.close();
      if (trigger?.isConnected) {
        if (!trigger.disabled) trigger.focus();
        else trigger.form?.querySelector<HTMLInputElement>("input[name=email]")?.focus();
      }
    };
  }, [opener]);

  return <dialog
    ref={dialog} id={id} aria-labelledby={`${id}-title`} aria-describedby={`${id}-intro`}
    className="m-auto max-h-[94dvh] w-[calc(100%_-_1rem)] max-w-3xl overflow-hidden rounded-2xl border border-[#d6e0ed] bg-white p-0 text-[#10243e] shadow-2xl backdrop:bg-[#10243e]/65 sm:w-[calc(100%_-_2.5rem)]"
    onCancel={event => {event.preventDefault(); if (!busy) onDismiss();}}
  >
    <div className="flex max-h-[94dvh] min-h-0 flex-col">
      <header className="shrink-0 border-b border-[#d6e0ed] px-4 py-3 sm:px-6 sm:py-4">
        <p className="text-xs font-semibold text-[#526675]">Registration notice · {REGISTRATION_POLICY_DISPLAY_VERSION}</p>
        <h2 ref={heading} tabIndex={-1} id={`${id}-title`} className="mt-1 text-[1.1875rem] font-semibold leading-tight tracking-tight sm:text-[1.375rem]">Review policy and declaration</h2>
        <p id={`${id}-intro`} className="mt-1 text-sm leading-5 text-[#526675]">See how we protect your information, then confirm you’ve read the notice and have authority to set up or join the workspace.</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
        <RegistrationPolicyDocument idPrefix={`${id}-policy`} headingLevel={3}/>
        <fieldset className="mt-6 min-w-0 rounded-xl border border-[#d6e0ed] bg-[#f4f7fb] px-3 pb-1 pt-1 sm:px-4">
          <legend className="px-1 text-sm font-semibold">Policy confirmation</legend>
          <DeclarationCheck
            id={`${id}-policy-check`} name={ACCOUNT_USE_ACKNOWLEDGEMENT_FIELD}
            value={ACCOUNT_USE_ACKNOWLEDGEMENT_VERSION} label={REGISTRATION_POLICY_LABEL} error={policyError}
          />
        </fieldset>
        <fieldset className="mt-4 min-w-0 rounded-xl border border-[#d6e0ed] bg-[#f4f7fb] px-3 pb-1 pt-1 sm:px-4">
          <legend className="px-1 text-sm font-semibold">{declaration.title}</legend>
          <ul id={`${id}-declaration-statements`} className="list-disc space-y-1 pl-5 text-sm leading-6 text-[#526675]">
            {declaration.statements.map(statement => <li key={statement}>{statement}</li>)}
          </ul>
          <DeclarationCheck
            id={`${id}-declaration-check`} name={REGISTRATION_DECLARATION_FIELD}
            value={declaration.value} label={declaration.label} error={declarationError}
            describedBy={`${id}-declaration-statements`}
          />
        </fieldset>
      </div>
      <footer className="shrink-0 border-t border-[#d6e0ed] bg-white px-4 py-3 sm:px-6">
        {captchaIncomplete?<p className="mb-2 text-sm leading-5 text-[#8b3d1f]" role="status">The security check expired. Return to your details to complete it again.</p>:null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onDismiss} disabled={busy} className="ev-button-secondary min-h-11 justify-center">Back to details</button>
          <button type="submit" data-registration-confirm disabled={busy||captchaIncomplete} className="ev-button min-h-11 justify-center">{busy?"Creating account…":"Agree and create account"}</button>
        </div>
      </footer>
    </div>
  </dialog>;
}

function DeclarationCheck({id, name, value, label, describedBy, error}:{
  id: string; name: string; value: string; label: string; describedBy?: string; error?: string;
}) {
  const errorId = `${id}-error`;
  const description = [describedBy,error?errorId:null].filter(Boolean).join(" ")||undefined;
  return <>
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-1 py-2.5 text-sm font-medium leading-5 text-[#10243e]">
      <input id={id} type="checkbox" name={name} value={value} required aria-invalid={!!error} aria-describedby={description}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[#10243e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10243e]"/>
      <span>{label}</span>
    </label>
    {error?<p id={errorId} className="px-1 pb-2 text-xs leading-5 text-red-700" role="alert">{error}</p>:null}
  </>;
}
