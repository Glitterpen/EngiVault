import {FieldWithHelp} from "@/components/field-with-help";
import {
  DOCUMENT_ISSUE_STATUSES,
  DOCUMENT_ISSUE_STATUS_GROUPS,
  isDocumentIssueStatus,
} from "@/lib/document-issue-status";
import type { ChangeEventHandler } from "react";

export function IssueStatusSelect({
  name,
  label = "Issue status",
  defaultValue = "",
  allowEmpty = false,
  emptyLabel = "Select issue status",
  disabled = false,
  disabledValues = [],
  onChange,
}: {
  name: string;
  label?: string;
  defaultValue?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  disabledValues?: readonly string[];
  onChange?: ChangeEventHandler<HTMLSelectElement>;
}) {
  const legacyValue = defaultValue && !isDocumentIssueStatus(defaultValue) ? defaultValue : null;

  return (
    <FieldWithHelp className="mt-4 block" label={<>{label}</>} helpLabel="Issue status guidance" help={<>Select the purpose for which this revision is formally issued.</>}><select
        className="ev-input"
        name={name}
        defaultValue={defaultValue}
        required={!allowEmpty}
        disabled={disabled}
        onChange={onChange}
      >
        <option value="" disabled={!allowEmpty}>
          {emptyLabel}
        </option>
        {legacyValue && <option value={legacyValue}>{legacyValue} (existing project status)</option>}
        {DOCUMENT_ISSUE_STATUS_GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {DOCUMENT_ISSUE_STATUSES.filter((status) => status.group === group).map((status) => (
              <option
                key={status.value}
                value={status.value}
                disabled={disabledValues.includes(status.value)}
              >
                {status.value}
              </option>
            ))}
          </optgroup>
        ))}
      </select></FieldWithHelp>
  );
}
