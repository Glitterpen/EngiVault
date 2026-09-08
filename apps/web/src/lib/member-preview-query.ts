// Read-only subset of PostgREST used by project pages. Unknown syntax fails
// closed; it must never fall back to the administrator's unrestricted client.
export type PreviewFilter = {column?:string;relation?:string;op:string;value?:string;values?:string[];not?:boolean;filters?:PreviewFilter[]};
type Selection = {name:string;alias:string;children?:Selection[];inner?:boolean};
const identifier=/^[a-z][a-z0-9_]*$/;

export function splitQuery(value:string):string[]{
  const result:string[]=[];let depth=0;let quote=false;let start=0;
  for(let i=0;i<value.length;i++){
    if(value[i]==='"'&&value[i-1]!=="\\")quote=!quote;
    if(quote)continue;
    if(value[i]==="(")depth++;
    if(value[i]===")")depth--;
    if(depth<0)throw new Error("Invalid preview query");
    if(value[i]===","&&depth===0){result.push(value.slice(start,i));start=i+1}
  }
  if(depth!==0||quote)throw new Error("Invalid preview query");
  if(value.slice(start))result.push(value.slice(start));
  return result;
}
export function parseSelection(value:string):Selection[]{
  return splitQuery(value).map(part=>{
    const match=part.match(/^([a-z][a-z0-9_]*:)?([a-z][a-z0-9_]*|\*)(!inner)?(?:\((.*)\))?$/);
    if(!match||match[4]==='')throw new Error("Unsupported preview selection");
    return {name:match[2],alias:match[1]?.slice(0,-1)??match[2],inner:Boolean(match[3]),children:match[4]?parseSelection(match[4]):undefined};
  });
}
function parseFilter(column:string,expression:string):PreviewFilter{
  if(column==='documents.lifecycle_status')return {...parseFilter('lifecycle_status',expression),relation:'documents'};
  if(column==='or'||column==='and'){
    if(!expression.startsWith('(')||!expression.endsWith(')'))throw new Error("Invalid preview group");
    return {op:column,filters:splitQuery(expression.slice(1,-1)).map(part=>{const dot=part.indexOf('.');return parseFilter(part.slice(0,dot),part.slice(dot+1))})};
  }
  if(!identifier.test(column))throw new Error("Unsupported preview filter column");
  const negated=expression.startsWith('not.');const rest=negated?expression.slice(4):expression;
  const dot=rest.indexOf('.');const op=rest.slice(0,dot);const value=rest.slice(dot+1);
  if(!['eq','neq','is','gt','gte','lt','lte','like','ilike','in'].includes(op))throw new Error("Unsupported preview operator");
  if(op==='in'){
    if(!value.startsWith('(')||!value.endsWith(')'))throw new Error("Invalid preview list");
    return {column,op,not:negated,values:splitQuery(value.slice(1,-1)).map(item=>item.startsWith('"')?JSON.parse(item) as string:item)};
  }
  return {column,op,not:negated,value:op==='like'||op==='ilike'?value.replaceAll('*','%'):value};
}
export function previewQuery(url:URL){
  const selection=parseSelection(url.searchParams.get('select')??'*');
  const filters:PreviewFilter[]=[];
  for(const [key,value] of url.searchParams){if(!['select','order','offset','limit'].includes(key))filters.push(parseFilter(key,value))}
  const order=splitQuery(url.searchParams.get('order')??'').map(value=>{
    const [column,direction,nulls]=value.split('.');
    if(!identifier.test(column)||!['asc','desc'].includes(direction)||nulls&&!['nullsfirst','nullslast'].includes(nulls))throw new Error("Unsupported preview ordering");
    return {column,ascending:direction!=='desc',nullsFirst:nulls?nulls==='nullsfirst':direction==='desc'};
  });
  return {selection,query:{filters,order,limit:Number(url.searchParams.get('limit')??1000),offset:Number(url.searchParams.get('offset')??0),
    embeds:selection.filter(s=>s.children).map(s=>s.name),inner:selection.filter(s=>s.inner).map(s=>s.name)}};
}
export function projectPreviewRow(row:Record<string,unknown>,selection:Selection[]):Record<string,unknown>{
  const output:Record<string,unknown>={};
  for(const field of selection){
    if(field.name==='*'){Object.assign(output,row);continue}
    const value=row[field.name];
    output[field.alias]=field.children&&value
      ?Array.isArray(value)?value.map(item=>projectPreviewRow(item,field.children!)):projectPreviewRow(value as Record<string,unknown>,field.children)
      :value??null;
  }
  return output;
}
