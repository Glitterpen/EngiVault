"use client";

import { useState } from "react";
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
  const router = useRouter();
  return (
    <div>
      <button
        className="ev-button"
        disabled={state === "loading"}
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
        {state === "loading" ? loadingLabel : label}
      </button>
      {state && state !== "loading" && state !== "ready" && <p className="mt-2 text-xs text-[#a5452f]">{state}</p>}
    </div>
  );
}
