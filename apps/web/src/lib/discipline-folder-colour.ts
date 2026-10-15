// Stable accents aid scanning; the discipline name always supplies the meaning.
const colours:Record<string,string>={
  electrical:"#b45309",
  "fire & gas":"#b91c1c",
  instrumentation:"#6d28d9",
  mechanical:"#1d4ed8",
  process:"#0f766e",
  project:"#475569",
  "subsea / pipeline":"#0e7490",
  piping:"#c2410c",
  structural:"#4338ca",
  civil:"#92400e",
  telecommunications:"#a21caf",
  "technical safety":"#be123c",
};
const palette=Object.values(colours);

export function disciplineFolderColour(discipline:string):string{
  const key=discipline.trim().replace(/\s+/g," ").toLowerCase();
  if(colours[key])return colours[key];
  let hash=0;
  for(const character of key)hash=(Math.imul(hash,31)+character.codePointAt(0)!)>>>0;
  return palette[hash%palette.length];
}
