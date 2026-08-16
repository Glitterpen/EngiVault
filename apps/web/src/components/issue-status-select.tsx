import {
  DOCUMENT_ISSUE_STATUSES,
  DOCUMENT_ISSUE_STATUS_GROUPS,
  isDocumentIssueStatus,
} from "@/lib/document-issue-status";

export function IssueStatusSelect({
  name,
  label = "Issue status",
  defaultValue = "",
  allowEmpty = false,
  emptyLabel = "Select issue status",
  disabled = false,
}: {
  name: string;
  label?: string;
  defaultValue?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const legacyValue = defaultValue && !isDocumentIssueStatus(defaultValue) ? defaultValue : null;

  return (
    <label className="mt-4 block">
      <span className="ev-label">{label}</span>
      <select
        className="ev-input"
        name={name}
        defaultValue={defaultValue}
        required={!allowEmpty}
        disabled={disabled}
      >
        <option value="" disabled={!allowEmpty}>
          {emptyLabel}
        </option>
        {legacyValue && <option value={legacyValue}>{legacyValue} (existing project status)</option>}
        {DOCUMENT_ISSUE_STATUS_GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {DOCUMENT_ISSUE_STATUSES.filter((status) => status.group === group).map((status) => (
              <option key={status.value} value={status.value}>
                {status.value}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="mt-1.5 block text-xs leading-5 text-[#617083]">
        Select the purpose for which this revision is formally issued.
      </span>
    </label>
  );
}
