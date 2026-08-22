const emailAddressPattern=/^[^\s<>@]+@[^\s<>@]+$/;

export function sanitiseEmailHeaderText(value:string|undefined|null,fallback:string){
  return (value??"").replace(/[\r\n]/g," ").replace(/\s+/g," ").trim().slice(0,160)||fallback;
}

export function formatOrganisationSender(configuredFrom:string,organisationName?:string|null){
  const bracketedAddress=configuredFrom.match(/<\s*([^<>]+)\s*>/)?.[1]?.trim();
  const address=bracketedAddress??configuredFrom.trim();
  if(!emailAddressPattern.test(address))return configuredFrom;

  const displayName=sanitiseEmailHeaderText(organisationName,"EngiCite").slice(0,120);
  const escapedDisplayName=displayName.replaceAll("\\","\\\\").replaceAll('"','\\"');
  return `"${escapedDisplayName}" <${address}>`;
}
