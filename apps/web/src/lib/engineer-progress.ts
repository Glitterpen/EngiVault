export type EngineerProgressHealth = "no_scope" | "on_track" | "at_risk" | "lagging";

export function engineerProgressHealth(input: {
  variancePoints: number;
  overdueCount: number;
  returnedCount: number;
  dueSoonCount: number;
  deliverableCount?: number;
}): EngineerProgressHealth {
  if (input.deliverableCount === 0) return "no_scope";
  if (input.variancePoints < 0 || input.overdueCount > 0 || input.returnedCount > 0) {
    return "lagging";
  }
  if (input.dueSoonCount > 0) return "at_risk";
  return "on_track";
}

export function recoverableProjectImpact(
  progressWeight: number,
  currentCredit: number,
  projectTotalWeight: number,
) {
  if (projectTotalWeight <= 0) return 0;
  const openCredit = Math.max(0, 100 - currentCredit) / 100;
  return Math.round((progressWeight * openCredit * 1000) / projectTotalWeight) / 10;
}
