"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
          const response = await fetch(endpoint, { method: "POST" });
          if (response.ok) {
            setState("ready");
            router.refresh();
          } else {
            const body = await response.json().catch(() => null);
            setState(body?.error?.message ?? "Package generation failed.");
          }
        }}
      >
        {state === "loading" ? loadingLabel : label}
      </button>
      {state && state !== "loading" && state !== "ready" && <p className="mt-2 text-xs text-[#a5452f]">{state}</p>}
    </div>
  );
}
