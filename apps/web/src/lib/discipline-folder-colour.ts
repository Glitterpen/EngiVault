// Stable logo-aligned accents aid scanning; the discipline name supplies the meaning.
const colours:Record<string,string>={
  electrical:"#b45309",
  "fire & gas":"#a64019",
  instrumentation:"#304c72",
  mechanical:"#1e3a5f",
  process:"#10243e",
  project:"#475569",
  "subsea / pipeline":"#43668f",
  piping:"#c2410c",
  structural:"#263d5b",
  civil:"#92400e",
  telecommunications:"#526b8b",
  "technical safety":"#9a451f",
};
const palette=Object.values(colours);

export function disciplineFolderColour(discipline:string):string{
  const key=discipline.trim().replace(/\s+/g," ").toLowerCase();
  if(colours[key])return colours[key];
  let hash=0;
  for(const character of key)hash=(Math.imul(hash,31)+character.codePointAt(0)!)>>>0;
  return palette[hash%palette.length];
}
