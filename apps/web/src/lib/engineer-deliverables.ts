export type EngineerDeliverableState =
  | "accepted"
  | "next_revision"
  | "in_review"
  | "returned"
  | "overdue"
  | "due_soon"
  | "not_submitted";

type StatusInput = {
  plannedSubmissionDate: string | null;
  controlStatus: string | null;
  progressCredit?: number;
};

export function engineerDeliverableState(
  input: StatusInput,
  today = new Date(),
): EngineerDeliverableState {
  if (input.controlStatus === "accepted") {
    return input.progressCredit !== undefined && input.progressCredit < 100
      ? "next_revision"
      : "accepted";
  }
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
  return state === "next_revision" || state === "returned" || state === "overdue" || state === "due_soon" || state === "not_submitted";
}

const actionPriority: Record<EngineerDeliverableState, number> = {
  returned: 0,
  overdue: 1,
  next_revision: 2,
  due_soon: 3,
  not_submitted: 4,
  in_review: 5,
  accepted: 6,
};

export function engineerActionPriority(state: EngineerDeliverableState) {
  return actionPriority[state];
}

export function engineerActionInstruction(state: EngineerDeliverableState) {
  switch (state) {
    case "returned":
      return "Address the Document Controller feedback and upload a corrected revision.";
    case "overdue":
      return "Upload the required revision now to recover the overdue schedule gap.";
    case "next_revision":
      return "Prepare the next controlled issue stage so this deliverable can reach 100%.";
    case "due_soon":
      return "Complete and upload the first revision before its planned submission date.";
    case "not_submitted":
      return "Plan and prepare the first revision ahead of its scheduled submission.";
    case "in_review":
      return "Monitor the Document Controller review; no engineer action is currently required.";
    case "accepted":
      return "This deliverable has reached its required terminal issue stage.";
  }
}

function startOfUtcDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
