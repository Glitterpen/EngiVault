export type FounderHealthState = "healthy" | "attention" | "critical";

export function licenceTimeLabel(daysRemaining: number | null, status: string): string {
  if (daysRemaining === null) return status === "active" ? "No fixed end date" : "No end date";
  if (daysRemaining === 0) return status === "cancelled" || status === "unlicensed" ? "Expired" : "Ends today";
  return `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`;
}

export function licenceDurationLabel(days: number | null): string {
  if (days === null) return "Not available";
  if (days >= 365 && days % 365 === 0) return `${days / 365} year${days === 365 ? "" : "s"}`;
  if (days >= 30 && days % 30 === 0) return `${days / 30} month${days === 30 ? "" : "s"}`;
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function healthClasses(state: FounderHealthState): string {
  if (state === "healthy") return "border-[#b9decf] bg-[#edf8f4] text-[#0c684e]";
  if (state === "attention") return "border-[#f1d6a0] bg-[#fff8e8] text-[#8b5a0a]";
  return "border-[#efc1bd] bg-[#fff0ef] text-[#a33b35]";
}

