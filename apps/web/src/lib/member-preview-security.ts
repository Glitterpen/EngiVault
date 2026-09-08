export function memberPreviewRequestAllowed(method:string,pathname:string,value:string):boolean{
  const path=pathname.replace(/\/+$/,'')||'/';
  if(path==='/api/admin-preview/exit')return method==='POST';
  if(!['GET','HEAD','OPTIONS'].includes(method))return false;
  if(/%2f|%5c|%2e|\\|(?:^|\/)\.\.(?:\/|$)/i.test(path))return false;
  const [org,project,session,...extra]=value.split(':');
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(extra.length||![org,project,session].every(part=>uuid.test(part??'')))return false;
  const app=`/app/${org}/projects/${project}`;
  const api=`/api/v1/organisations/${org}/projects/${project}`;
  if(path===app||path.startsWith(app+'/'))return !path.startsWith(app+'/administration');
  if(path===api||path.startsWith(api+'/'))return !path.startsWith(api+'/backups');
  return path==='/app/notifications'||path.startsWith('/app/notifications/')||path===`/api/v1/organisations/${org}/logo`;
}
