import {safeAuthDestination} from "./auth-destination";

export function protectedSignInPath(pathname:string){
  return pathname.startsWith("/founder")?"/founder-access":"/login";
}

/** Remember only a supported, same-origin workspace destination after sign-out. */
export function protectedSignInUrl(pathname:string,search="",reason?:"expired"){
  const destination=safeAuthDestination(`${pathname}${search}`);
  const query=new URLSearchParams();
  if(reason)query.set("session",reason);
  query.set("next",destination);
  return `${protectedSignInPath(destination)}?${query.toString()}`;
}
