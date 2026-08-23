export const MAX_UPLOAD_BYTES=250*1024*1024;
export const MAX_ORGANISATION_LOGO_BYTES=2*1024*1024;
export const MAX_PROJECT_LOGO_BYTES=2*1024*1024;
export const ORGANISATION_LOGO_MIMES=["image/png","image/jpeg","image/webp"] as const;
export const PROJECT_LOGO_MIMES=ORGANISATION_LOGO_MIMES;

const MIME_BY_EXTENSION:Record<string,string>={
  pdf:"application/pdf",
  docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  dwg:"image/vnd.dwg",
};

const NATIVE_ENGINEERING_EXTENSIONS=new Set(["dwg","docx","xlsx"]);

export function fileExtension(name:string){return name.split(".").pop()?.toLowerCase()??""}
export function expectedMime(name:string){return MIME_BY_EXTENSION[fileExtension(name)]??null}
export function canonicalUploadMime(name:string,reportedMime:string){const expected=expectedMime(name);return fileExtension(name)==="dwg"?expected:reportedMime}
export function hasExpectedMime(name:string,mime:string){return expectedMime(name)===mime}
export function isNativeEngineeringFile(name:string){return NATIVE_ENGINEERING_EXTENSIONS.has(fileExtension(name))}

export function hasSupportedSignature(name:string,header:Uint8Array){
  const ext=fileExtension(name);
  if(ext==="pdf")return startsWith(header,[0x25,0x50,0x44,0x46,0x2d]);
  if(ext==="dwg")return startsWith(header,[0x41,0x43,0x31,0x30]);
  if(ext==="docx"||ext==="xlsx")return startsWith(header,[0x50,0x4b,0x03,0x04])||startsWith(header,[0x50,0x4b,0x05,0x06])||startsWith(header,[0x50,0x4b,0x07,0x08]);
  return false;
}

export function hasSupportedOrganisationLogoSignature(mime:string,header:Uint8Array){
  if(mime==="image/png")return startsWith(header,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  if(mime==="image/jpeg")return startsWith(header,[0xff,0xd8,0xff]);
  if(mime==="image/webp")return startsWith(header,[0x52,0x49,0x46,0x46])&&header[8]===0x57&&header[9]===0x45&&header[10]===0x42&&header[11]===0x50;
  return false;
}

export function organisationLogoValidation(size:number,mime:string,header:Uint8Array){
  if(size<=0)return "Choose your company logo.";
  if(size>MAX_ORGANISATION_LOGO_BYTES)return "Company logo must be 2 MB or smaller.";
  if(!ORGANISATION_LOGO_MIMES.includes(mime as (typeof ORGANISATION_LOGO_MIMES)[number]))return "Company logo must be a PNG, JPEG or WebP image.";
  if(!hasSupportedOrganisationLogoSignature(mime,header))return "The selected company logo is not a valid image file.";
  return null;
}

export function projectLogoValidation(size:number,mime:string,header:Uint8Array){
  if(size<=0)return "Choose a client logo.";
  if(size>MAX_PROJECT_LOGO_BYTES)return "Each client logo must be 2 MB or smaller.";
  if(!PROJECT_LOGO_MIMES.includes(mime as (typeof PROJECT_LOGO_MIMES)[number]))return "Client logos must be PNG, JPEG or WebP images.";
  if(!hasSupportedOrganisationLogoSignature(mime,header))return "One of the selected client logos is not a valid image file.";
  return null;
}

function startsWith(value:Uint8Array,prefix:number[]){return prefix.every((byte,index)=>value[index]===byte)}
