// Discipline punctuation is significant: these names also scope engineer access.
export function normaliseDiscipline(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export type ProjectCategory = { kind: string; code: string; name: string };

export type DisciplineRemovalImpact = {
  name: string;
  engineerCount: number;
  documentCount: number;
  invitationCount: number;
  plannedPositions: number;
};

export function matchDiscipline(categories: ProjectCategory[], value: string) {
  const key = normaliseDiscipline(value);
  if (!key) return undefined;
  return categories.find(category => category.kind === "discipline" &&
    (normaliseDiscipline(category.name) === key || (category.code && normaliseDiscipline(category.code) === key)))?.name;
}

export function disciplineLabel(item: { code: string; name: string }) {
  return item.code ? `${item.code} — ${item.name}` : item.name;
}
