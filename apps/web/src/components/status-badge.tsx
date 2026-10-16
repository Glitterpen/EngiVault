import type {ComponentPropsWithoutRef} from "react";

export type StatusBadgeTone="neutral"|"info"|"success"|"warning"|"danger";
type Props=ComponentPropsWithoutRef<"span">&{tone?:StatusBadgeTone};

const tones={
  neutral:"border-[#d6dee8] bg-[#f3f6f9] text-[#405566]",
  info:"border-[#cedbec] bg-[#eef3fa] text-[#244b73]",
  success:"border-[#c9d5e4] bg-[#edf2f8] text-[#10243e]",
  warning:"border-[#edc8b5] bg-[#fff2e9] text-[#8b431f]",
  danger:"border-[#e8c1b5] bg-[#fff0eb] text-[#963f2b]",
} satisfies Record<StatusBadgeTone,string>;

/** Presentation only: domain callers provide the exact label and explicit tone. */
export function StatusBadge({children,tone="neutral",className="",...props}:Props){
  return <span {...props} className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2.5 py-0.5 align-middle text-xs font-medium leading-5 whitespace-normal [overflow-wrap:anywhere] ${tones[tone]} ${className}`}>{children}</span>;
}
