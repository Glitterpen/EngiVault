"use client";

import { useId } from "react";

export function DocumentTypeInput({
  suggestions = [],
  defaultValue = "",
}: {
  suggestions?: { code: string; name: string }[];
  defaultValue?: string;
}) {
  const id = useId();
  return <div className="mt-4">
    <label htmlFor={id} className="ev-label">Document type</label>
    <input
      id={id}
      className="ev-input"
      name="documentType"
      list={suggestions.length ? `${id}-suggestions` : undefined}
      defaultValue={defaultValue}
      placeholder="Choose a suggestion or enter a document type"
      maxLength={80}
      required
      aria-describedby={`${id}-help`}
    />
    {suggestions.length > 0 && <datalist id={`${id}-suggestions`}>
      {suggestions.map(item => <option key={item.code} value={item.name}>{item.code} — {item.name}</option>)}
    </datalist>}
    <p id={`${id}-help`} className="mt-1 text-xs leading-5 text-[#617083]">
      Not listed? Enter your own document type (up to 80 characters).
    </p>
  </div>;
}
