export const MAX_UPLOAD_BYTES=250*1024*1024;

const MIME_BY_EXTENSION:Record<string,string>={
  pdf:"application/pdf",
  docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  dwg:"image/vnd.dwg",
};

export function fileExtension(name:string){return name.split(".").pop()?.toLowerCase()??""}
export function expectedMime(name:string){return MIME_BY_EXTENSION[fileExtension(name)]??null}
export function canonicalUploadMime(name:string,reportedMime:string){const expected=expectedMime(name);return fileExtension(name)==="dwg"?expected:reportedMime}
export function hasExpectedMime(name:string,mime:string){return expectedMime(name)===mime}

export function hasSupportedSignature(name:string,header:Uint8Array){
  const ext=fileExtension(name);
  if(ext==="pdf")return startsWith(header,[0x25,0x50,0x44,0x46,0x2d]);
  if(ext==="dwg")return startsWith(header,[0x41,0x43,0x31,0x30]);
  if(ext==="docx"||ext==="xlsx")return startsWith(header,[0x50,0x4b,0x03,0x04])||startsWith(header,[0x50,0x4b,0x05,0x06])||startsWith(header,[0x50,0x4b,0x07,0x08]);
  return false;
}

function startsWith(value:Uint8Array,prefix:number[]){return prefix.every((byte,index)=>value[index]===byte)}
