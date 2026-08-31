export function protectedSignInPath(pathname:string){
  return pathname.startsWith("/founder")?"/founder-access":"/login";
}
