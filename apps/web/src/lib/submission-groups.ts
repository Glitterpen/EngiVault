import {DOCUMENT_ISSUE_STATUSES} from "./document-issue-status";

const issueLabels = DOCUMENT_ISSUE_STATUSES.map(({value}) => value);

function issueLabel(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "Issue purpose not specified";
  const key = trimmed.toLowerCase();
  return issueLabels.find(label => {
    const normalized = label.toLowerCase();
    const code = normalized.match(/\(([^)]+)\)$/)?.[1];
    return normalized === key || code === key || normalized.replace(/\s*\([^)]+\)$/, "") === key;
  }) ?? trimmed;
}

/** Group current deliverables, not historical revisions or their required future stage. */
export function groupSubmissions<T extends {latest: {issue_status: string | null} | null}>(items: readonly T[]) {
  const groups = new Map<string, {label: string; items: T[]}>();
  for (const item of items) {
    const label = item.latest ? issueLabel(item.latest.issue_status) : "Not submitted";
    const key = label.toLowerCase();
    const group = groups.get(key) ?? {label, items: []};
    group.items.push(item);
    groups.set(key, group);
  }
  const rank = (label: string) => {
    if (label === "Not submitted") return -1;
    const index = issueLabels.findIndex(issue => issue === label);
    return index < 0 ? issueLabels.length : index;
  };
  return [...groups.values()].sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label));
}
