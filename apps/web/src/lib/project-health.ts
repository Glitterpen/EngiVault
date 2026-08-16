export type ProjectHealth="Setup required"|"On track"|"Needs attention"|"At risk"|"Complete";

export function assessProjectHealth({deliverables,completion,overdue,highIssues,criticalIssues}:{deliverables:number;completion:number;overdue:number;highIssues:number;criticalIssues:number}):ProjectHealth{
  if(criticalIssues>0||overdue>Math.max(1,Math.ceil(deliverables*.2)))return "At risk";
  if(highIssues>0||overdue>0)return "Needs attention";
  if(deliverables===0)return "Setup required";
  if(completion>=100)return "Complete";
  return "On track";
}

export function healthTone(health:ProjectHealth):string{
  if(health==="Complete"||health==="On track")return "bg-[#e8f1ed] text-[#0c5b45]";
  if(health==="At risk")return "bg-[#fde8e4] text-[#9b2c24]";
  if(health==="Needs attention")return "bg-[#fff0e9] text-[#a5452f]";
  return "bg-[#eef1f4] text-[#617083]";
}
