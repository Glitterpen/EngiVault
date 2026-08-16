export type EngineerDeliverableState =
  | "accepted"
  | "in_review"
  | "returned"
  | "overdue"
  | "due_soon"
  | "not_submitted";

type StatusInput = {
  plannedSubmissionDate: string | null;
  controlStatus: string | null;
};

export function engineerDeliverableState(
  input: StatusInput,
  today = new Date(),
): EngineerDeliverableState {
  if (input.controlStatus === "accepted") return "accepted";
  if (input.controlStatus === "submitted") return "in_review";
  if (input.controlStatus === "returned") return "returned";
  if (!input.plannedSubmissionDate) return "not_submitted";

  const due = startOfUtcDay(input.plannedSubmissionDate);
  const current = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.ceil((due - current) / 86_400_000);

  if (days < 0) return "overdue";
  if (days <= 7) return "due_soon";
  return "not_submitted";
}

export function requiresEngineerAction(state: EngineerDeliverableState) {
  return state === "returned" || state === "overdue" || state === "due_soon" || state === "not_submitted";
}

function startOfUtcDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
