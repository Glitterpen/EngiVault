import { normaliseDiscipline, type ProjectCategory } from "./project-disciplines";

// The project catalogue excludes both archived and permanently removed disciplines.
// Keep the saved plans untouched so restoring a discipline restores its readiness.
export function activeProjectResourcePlans<T extends { discipline: string }>(
  plans: readonly T[],
  categories: readonly ProjectCategory[],
): T[] {
  const activeNames = new Set(categories
    .filter(category => category.kind === "discipline")
    .map(category => normaliseDiscipline(category.name)));
  return plans.filter(plan => activeNames.has(normaliseDiscipline(plan.discipline)));
}
