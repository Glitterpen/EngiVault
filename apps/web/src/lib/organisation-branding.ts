export function organisationLogoEndpoint(organisationId:string,version?:string|null){
 const endpoint=`/api/v1/organisations/${organisationId}/logo`;
 return version?`${endpoint}?v=${encodeURIComponent(version)}`:endpoint;
}
