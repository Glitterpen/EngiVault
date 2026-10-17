// Controlled reports use the same UTC text on the server and in every browser.
// Avoid host locale/timezone and ICU-version differences during hydration.
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sept","Oct","Nov","Dec"];
const two=(value:number)=>String(value).padStart(2,"0");

function dateText(date:Date){
  return `${two(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatReportDate(value:string|null){
  if(!value)return "Not planned";
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())?"Not planned":dateText(date);
}

export function formatReportTimestamp(value:string){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return "Unavailable";
  return `${dateText(date)}, ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`;
}
