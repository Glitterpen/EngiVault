"use client";

import { useId } from "react";
import {FieldWithHelp} from "@/components/field-with-help";

export function DocumentTypeInput({
  suggestions = [],
  defaultValue = "",
}: {
  suggestions?: { code: string; name: string }[];
  defaultValue?: string;
}) {
  const id = useId();
  return <div className="mt-4">
    <FieldWithHelp label="Document type" helpLabel="Document type guidance" help="Not listed? Enter your own document type (up to 80 characters).">
    <input
      id={id}
      className="ev-input"
      name="documentType"
      list={suggestions.length ? `${id}-suggestions` : undefined}
      defaultValue={defaultValue}
      placeholder="Choose a suggestion or enter a document type"
      maxLength={80}
      required
    />
    </FieldWithHelp>
    {suggestions.length > 0 && <datalist id={`${id}-suggestions`}>
      {suggestions.map(item => <option key={item.code} value={item.name}>{item.code} — {item.name}</option>)}
    </datalist>}
  </div>;
}
