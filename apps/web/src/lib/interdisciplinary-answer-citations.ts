// Provider source IDs refer to retrieval positions. Display labels are a compact
// subset, so normalise the answer and reference cards together or fail closed.
export function normaliseInterdisciplinaryCitations(answer:string,sourceIds:number[]):string|null{
  if(!sourceIds.length)return answer;
  const labels=new Map(sourceIds.map((id,index)=>[id,index+1]));
  const seen=new Set<number>();
  let invalid=false;
  const normalised=answer.replace(/\[\s*(\d+(?:\s*[,;]\s*\d+)*)\s*\]/g,(_marker,group:string)=>{
    const ids=group.split(/\s*[,;]\s*/).map(Number);
    if(ids.some(id=>!labels.has(id))){invalid=true;return ""}
    ids.forEach(id=>seen.add(id));
    return ids.map(id=>`[${labels.get(id)}]`).join(" ");
  });
  return invalid||sourceIds.some(id=>!seen.has(id))?null:normalised;
}
