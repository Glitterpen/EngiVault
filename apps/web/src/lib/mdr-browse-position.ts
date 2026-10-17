type BrowsePosition={search?:string;records?:string;folder?:string|null;page?:number};

export function mdrFolderPage(value:unknown,count?:number){
  const page=typeof value==="number"?value:typeof value==="string"&&/^[1-9]\d{0,5}$/.test(value)?Number(value):1;
  const valid=Number.isSafeInteger(page)&&page>0&&page<=999_999?page:1;
  return count===undefined?valid:Math.min(valid,Math.max(1,Math.ceil(count/25)));
}

/** Browsing metadata only: never carry preview tokens, document records or arbitrary URLs. */
export function mdrBrowseQuery({search="",records="",folder,page=1}:BrowsePosition){
  const query=new URLSearchParams();
  const term=search.replaceAll(/[,%()"\\\u0000-\u001f\u007f]/g,"").trim().slice(0,100);
  if(term)query.set("q",term);
  if(records==="removed")query.set("records","removed");
  if(typeof folder==="string"&&folder.length>0&&folder.length<=160&&!/[\u0000-\u001f\u007f]/.test(folder)){
    query.set("folder",folder);
    if(mdrFolderPage(page)>1)query.set("folderPage",String(mdrFolderPage(page)));
  }
  return query.toString();
}

/** The destination path is always constructed from the already-authorised project. */
export function mdrReturnHref(organisationId:string,projectId:string,value:unknown){
  if(typeof value!=="string"||!value||value.length>1_200)return null;
  const query=new URLSearchParams(value);
  if([...query.keys()].some(key=>!["q","records","folder","folderPage"].includes(key))
    ||[...new Set(query.keys())].some(key=>query.getAll(key).length!==1))return null;
  const folder=query.get("folder");
  if(!folder||folder.length>160||/[\u0000-\u001f\u007f]/.test(folder))return null;
  const canonical=mdrBrowseQuery({search:query.get("q")??"",records:query.get("records")??"",folder,page:mdrFolderPage(query.get("folderPage"))});
  return `/app/${organisationId}/projects/${projectId}/documents?${canonical}`;
}
