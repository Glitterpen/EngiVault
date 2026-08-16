import "server-only";

function hex(bytes:ArrayBuffer|Uint8Array){
  const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  return Array.from(view,byte=>byte.toString(16).padStart(2,"0")).join("");
}

export async function createInvitationToken(){
  const raw=hex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash=hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw)));
  return {raw,tokenHash,expiresAt:new Date(Date.now()+7*86400_000).toISOString()};
}
