"use client";

import { useId, useState } from "react";
import { LoaderCircle, PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { customerErrorMessage } from "@/lib/customer-messages";

export function WorkPackageGenerate({
  endpoint,
  label = "Generate package ZIP",
  loadingLabel = "Building secure ZIP…",
}: {
  endpoint: string;
  label?: string;
  loadingLabel?: string;
}) {
  const [state, setState] = useState("");
  const statusId = useId();
  const router = useRouter();
  return (
    <div className="w-full min-w-0 sm:w-auto sm:max-w-sm">
      <button
        type="button"
        className="ev-button min-h-11 w-full justify-center sm:w-auto"
        disabled={state === "loading"}
        aria-busy={state === "loading"}
        aria-describedby={state ? state === "loading" || state === "ready" ? statusId : `${statusId}-error` : undefined}
        onClick={async () => {
          setState("loading");
          try {
            const response = await fetch(endpoint, { method: "POST" });
            if (response.ok) {
              setState("ready");
              router.refresh();
            } else {
              const body = await response.json().catch(() => null);
              setState(customerErrorMessage(body?.error?.message, "Package generation failed. Please try again."));
            }
          } catch {
            setState("Package generation could not be completed. Check your connection and try again.");
          }
        }}
      >
        {state === "loading" ? <LoaderCircle size={16} aria-hidden="true" className="shrink-0 animate-spin motion-reduce:animate-none" /> : <PackageCheck size={16} aria-hidden="true" className="shrink-0" />}
        <span>{state === "loading" ? loadingLabel : label}</span>
      </button>
      <p id={statusId} role="status" aria-live="polite" className={state === "loading" || state === "ready" ? "mt-2 text-xs leading-5 text-[#526675]" : "sr-only"}>{state === "loading" ? loadingLabel : state === "ready" ? "Package ready. Refreshing the download…" : ""}</p>
      {state && state !== "loading" && state !== "ready" && <p id={`${statusId}-error`} role="alert" className="mt-2 break-words text-sm leading-6 text-[#a5452f]">{state}</p>}
    </div>
  );
}
