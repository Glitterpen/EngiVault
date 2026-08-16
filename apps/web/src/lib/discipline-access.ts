export function normaliseDiscipline(value:string):string{
  return value.trim().replaceAll(/\s+/g," ").toLocaleLowerCase("en");
}

export function disciplineMatches(left:string,right:string):boolean{
  return normaliseDiscipline(left)===normaliseDiscipline(right);
}

export function canonicalDiscipline(available:readonly string[],requested:string):string|undefined{
  return available.find(value=>disciplineMatches(value,requested));
}
