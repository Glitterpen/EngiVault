import { REGISTRATION_POLICY_SECTIONS } from "@/lib/registration-policy-content";

const contentsLabels: Readonly<Record<string, string>> = {
  scope: "Who this applies to",
  authority: "Set up or join a workspace",
  "engione-responsibilities": "EngiOne LTD’s responsibilities",
  information: "Information we handle",
  responsibilities: "Workspace responsibilities",
  security: "Security safeguards",
  sharing: "Sharing and search",
  "transfers-retention": "Location and retention",
  "data-rights": "Privacy rights",
  incidents: "Help and policy updates",
};

export function RegistrationPolicyDocument({ idPrefix, headingLevel = 2, layout = "inline" }: {
  idPrefix: string;
  headingLevel?: 2 | 3;
  layout?: "inline" | "sidebar";
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const sidebar = layout === "sidebar";
  return (
    <div className={`grid min-w-0 gap-6 text-sm leading-[1.6] text-[#40536a] ${sidebar ? "lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-9" : ""}`}>
      <nav aria-label="Policy sections" className={`min-w-0 rounded-xl border border-[#d6e0ed] bg-[#f4f7fb] px-3 py-2.5 sm:px-4 ${sidebar ? "lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:px-3" : ""}`}>
        <p className="mx-1 mb-1 border-b border-[#d6e0ed] pb-2 text-sm font-semibold text-[#10243e]">On this page</p>
        <ol role="list" className={`grid gap-x-2.5 min-[380px]:grid-cols-2 sm:gap-x-5 ${sidebar ? "lg:grid-cols-1" : ""}`}>
          {REGISTRATION_POLICY_SECTIONS.map((section, index) => (
            <li key={section.id} className="min-w-0">
              <a href={`#${idPrefix}-${section.id}`} className="group flex min-h-9 items-baseline gap-2 rounded-md px-1.5 py-2 text-[0.8125rem] font-medium leading-snug text-[#21466f] hover:bg-[#e7eef7] focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-[#10243e]">
                <span aria-hidden="true" className="shrink-0 text-xs font-semibold text-[#526675] tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                <span className="underline decoration-[#687e9a] underline-offset-2 group-hover:decoration-current">{contentsLabels[section.id] ?? section.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="min-w-0 max-w-[68ch] space-y-5">
        {REGISTRATION_POLICY_SECTIONS.map((section, index) => (
          <section key={section.id} aria-labelledby={`${idPrefix}-${section.id}`} className="space-y-2 border-b border-[#d6e0ed] pb-5 last:border-b-0 last:pb-0">
            <Heading id={`${idPrefix}-${section.id}`} tabIndex={-1} className="scroll-mt-4 rounded-sm text-base font-semibold leading-snug text-[#10243e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10243e] target:text-[#21466f]">
              {index + 1}. {section.title}
            </Heading>
            {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            {section.commitments?.length ? (
              <dl className="mt-3 divide-y divide-[#d6e0ed] rounded-lg border border-[#d6e0ed] bg-[#f4f7fb] px-3 sm:px-4">
                {section.commitments.map(({ title, description }) => (
                  <div key={title} className="py-2.5">
                    <dt className="font-semibold text-[#10243e]">{title}</dt>
                    <dd className="mt-0.5">{description}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {section.bullets?.length ? (
              <ul className="list-disc space-y-1 pl-5 marker:text-[#526675]">
                {section.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
