const base=process.env.ENGICITE_URL??"http://127.0.0.1:3000";
const response=await fetch(`${base}/login`,{redirect:"manual"});
const required=["content-security-policy","x-content-type-options","x-frame-options","referrer-policy","permissions-policy","cross-origin-resource-policy"];
const missing=required.filter(name=>!response.headers.get(name));
if(response.status!==200||missing.length){console.error(`Security header check failed: HTTP ${response.status}; missing: ${missing.join(", ")}`);process.exit(1)}
console.log(`Security headers passed for ${base} (${required.length}/${required.length}).`);
