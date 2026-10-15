export type DeliveryCurveDocument={document_id:string;progress_weight:number;progress_credit:number;planned_final_date:string|null};
export type DeliveryCurveReport={id:string;period_end:string;generated_at:string;snapshot:unknown};
export type DeliveryCurvePoint={date:string;planned:number|null;actual:number|null;actualSource:"report"|"live"|null};
export type DeliveryCurveModel={points:DeliveryCurvePoint[];asOf:string;plannedToday:number|null;actualToday:number;variance:number|null;plannedCoverage:number;undatedCount:number;historyCount:number;invalidHistoryCount:number;hasScope:boolean;historyAvailable:boolean};

type Input={documents:readonly DeliveryCurveDocument[];reports:readonly DeliveryCurveReport[];asOf:string;plannedStart:string|null;plannedEnd:string|null;historyAvailable:boolean};
type Observation={date:string;generatedAt:number;id:string;actual:number};
const DAY=86_400_000,WEEK=7*DAY,MAX_POINTS=300;

function dateTime(value:string):number|null{
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const leap=year%4===0&&(year%100!==0||year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(month<1||month>12||day<1||day>days[month-1])return null;
  const timestamp=Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp)?timestamp:null;
}
function timestampTime(value:string):number|null{
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||dateTime(value.slice(0,10))===null)return null;
  const timestamp=Date.parse(value);
  return Number.isFinite(timestamp)?timestamp:null;
}
function finiteNumber(value:unknown):number|null{
  if(typeof value!=="number"&&(typeof value!=="string"||!value.trim()))return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}
function bounded(value:unknown,maximum:number):number{return Math.min(maximum,Math.max(0,finiteNumber(value)??0));}
function object(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==="object"&&!Array.isArray(value);}
function snapshotProgress(snapshot:unknown):number|null{
  if(!object(snapshot)||!object(snapshot.summary))return null;
  const value=finiteNumber(snapshot.summary.overall_progress);
  return value!==null&&value>=0&&value<=100?value:null;
}
function dayString(time:number){return new Date(time).toISOString().slice(0,10);}
function evenly<T>(items:readonly T[],limit:number):T[]{
  if(limit<=0)return [];
  if(items.length<=limit)return [...items];
  if(limit===1)return [items[items.length-1]];
  return Array.from({length:limit},(_,index)=>items[Math.round(index*(items.length-1)/(limit-1))]);
}

/** Current terminal-date baseline plus observed saved reports and one live point. */
export function buildProjectDeliveryCurve({documents,reports,asOf,plannedStart,plannedEnd,historyAvailable}:Input):DeliveryCurveModel{
  const now=timestampTime(asOf);
  if(now===null)throw new Error("A valid as-of timestamp is required for the delivery curve.");
  const normalizedAsOf=new Date(now).toISOString(),today=normalizedAsOf.slice(0,10);
  let totalWeight=0,datedWeight=0,earned=0,undatedCount=0,hasUndatedWeight=false;
  const deadlines=new Map<string,number>();
  for(const document of documents){
    const weight=bounded(document.progress_weight,Number.MAX_SAFE_INTEGER),credit=bounded(document.progress_credit,100);
    totalWeight+=weight;earned+=weight*credit/100;
    const date=typeof document.planned_final_date==="string"&&dateTime(document.planned_final_date)!==null?document.planned_final_date:null;
    if(!date){undatedCount++;if(weight>0)hasUndatedWeight=true;continue;}
    datedWeight+=weight;
    if(weight>0)deadlines.set(date,(deadlines.get(date)??0)+weight);
  }
  const actualToday=totalWeight?Math.min(100,Math.max(0,Math.round(earned/totalWeight*100))):0;
  const fullyDated=totalWeight>0&&!hasUndatedWeight;
  // Keep a genuinely partial weighted baseline below 100 after display rounding.
  const plannedCoverage=totalWeight?fullyDated?100:Math.min(99.9,Math.round(datedWeight/totalWeight*1000)/10):0;
  let invalidHistoryCount=0;
  const observations=new Map<string,Observation>();
  if(historyAvailable){
    for(const report of reports){
      const cutoff=typeof report.period_end==="string"?dateTime(report.period_end):null;
      const generatedAt=typeof report.generated_at==="string"?timestampTime(report.generated_at):null;
      if(cutoff===null||generatedAt===null){invalidHistoryCount++;continue;}
      if(report.period_end>today||generatedAt>now)continue;
      const actual=snapshotProgress(report.snapshot);
      if(actual===null){invalidHistoryCount++;continue;}
      // Today's saved observation is superseded by the actual live calculation.
      if(report.period_end===today)continue;
      const id=typeof report.id==="string"?report.id:"";
      const prior=observations.get(report.period_end);
      if(!prior||generatedAt>prior.generatedAt||generatedAt===prior.generatedAt&&id>prior.id)observations.set(report.period_end,{date:report.period_end,generatedAt,id,actual});
    }
  }
  const dates=new Set<string>([today]);
  for(const value of [plannedStart,plannedEnd])if(typeof value==="string"&&dateTime(value)!==null)dates.add(value);
  // Reserve the live point and real project endpoints before sampling very long
  // report registers. Actual values only ever come from retained observations.
  const history=evenly([...observations.values()].sort((a,b)=>a.date.localeCompare(b.date)),MAX_POINTS-dates.size);
  const retained=new Map(history.map(point=>[point.date,point.actual]));
  for(const point of history)dates.add(point.date);
  if(deadlines.size&&dates.size<MAX_POINTS){
    const candidates=new Set(deadlines.keys());
    const range=[...dates,...deadlines.keys()].sort();
    const start=dateTime(range[0])!,end=dateTime(range[range.length-1])!;
    const weekCount=Math.floor((end-start)/WEEK);
    const samples=Math.min(MAX_POINTS,weekCount+1);
    for(let index=0;index<samples;index++){
      const week=samples===1?0:Math.round(index*weekCount/(samples-1));
      candidates.add(dayString(start+week*WEEK));
    }
    for(const date of evenly([...candidates].filter(date=>!dates.has(date)).sort(),MAX_POINTS-dates.size))dates.add(date);
  }
  const due=[...deadlines].sort(([a],[b])=>a.localeCompare(b));
  let dueIndex=0,cumulativeWeight=0;
  const points=[...dates].sort().map(date=>{
    while(dueIndex<due.length&&due[dueIndex][0]<=date){cumulativeWeight+=due[dueIndex][1];dueIndex++;}
    const planned=datedWeight>0?Math.min(plannedCoverage,Math.max(0,Math.round(cumulativeWeight/totalWeight*1000)/10)):null;
    const actual=date===today?actualToday:retained.get(date)??null;
    const actualSource=date===today?"live":retained.has(date)?"report":null;
    return {date,planned,actual,actualSource} satisfies DeliveryCurvePoint;
  });
  const plannedToday=fullyDated?points.find(point=>point.date===today)!.planned:null;
  return {points,asOf:normalizedAsOf,plannedToday,actualToday,variance:plannedToday===null?null:Math.round((actualToday-plannedToday)*10)/10,plannedCoverage,undatedCount,historyCount:history.length,invalidHistoryCount,hasScope:documents.length>0,historyAvailable};
}
