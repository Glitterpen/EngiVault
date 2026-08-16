export function projectLogoEndpoint(organisationId:string,projectId:string,version?:string|null,index=1){
 const endpoint=`/api/v1/organisations/${organisationId}/projects/${projectId}/logo`;
 const query=new URLSearchParams();
 if(index>1)query.set("index",String(index));
 if(version)query.set("v",version);
 const suffix=query.toString();
 return suffix?`${endpoint}?${suffix}`:endpoint;
}
