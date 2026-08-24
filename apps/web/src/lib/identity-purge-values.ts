const userIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function deletedIdentityEmail(userId:string){
  if(!userIdPattern.test(userId))throw new Error("Invalid user identity");
  return `deleted-${userId.replaceAll("-","").toLowerCase()}@deleted.invalid`;
}

export function deletedIdentityPassword(){
  return `${crypto.randomUUID().replaceAll("-","")}${crypto.randomUUID().replaceAll("-","")}Aa1!`;
}

export function validIdentityPurgeIds(values:unknown):string[]{
  if(!Array.isArray(values))return [];
  return [...new Set(values.filter((value):value is string=>typeof value==="string"&&userIdPattern.test(value)))];
}
