export type EngineerDeliverableSort = "recent" | "due" | "number";

export type EngineerDisciplineGroup<T> = {discipline: string; items: T[]};

type GroupOptions<T> = {
  items: readonly T[];
  authorisedDisciplines: readonly string[];
  getDiscipline: (item: T) => string;
  getDocumentNumber: (item: T) => string;
  getCreatedAt?: (item: T) => string | null | undefined;
  getDueDate?: (item: T) => string | null | undefined;
  sort?: EngineerDeliverableSort;
};

const naturalOrder = new Intl.Collator("en-GB", {numeric: true, sensitivity: "base"});
const disciplineKey = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

function timestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOrder(left: number | null, right: number | null, descending: boolean) {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return descending ? right - left : left - right;
}

/** Presentation only: supplied scopes and items must already be permission checked. */
export function groupEngineerDisciplineItems<T>({items, authorisedDisciplines, getDiscipline, getDocumentNumber, getCreatedAt, getDueDate, sort = "recent"}: GroupOptions<T>): EngineerDisciplineGroup<T>[] {
  const groups = new Map<string, EngineerDisciplineGroup<T>>();
  for (const discipline of authorisedDisciplines) {
    const key = disciplineKey(discipline);
    if (key && !groups.has(key)) groups.set(key, {discipline: discipline.trim().replace(/\s+/g, " "), items: []});
  }
  for (const item of items) groups.get(disciplineKey(getDiscipline(item)))?.items.push(item);

  for (const group of groups.values()) {
    group.items.sort((left, right) => {
      let result = 0;
      if (sort === "recent") result = dateOrder(timestamp(getCreatedAt?.(left)), timestamp(getCreatedAt?.(right)), true);
      if (sort === "due") result = dateOrder(timestamp(getDueDate?.(left)), timestamp(getDueDate?.(right)), false);
      return result || naturalOrder.compare(getDocumentNumber(left), getDocumentNumber(right));
    });
  }
  return [...groups.values()].sort((left, right) => naturalOrder.compare(left.discipline, right.discipline));
}
