import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

http.createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).pathname;
  const publicFiles = {
    "/engicite-logo.png": { file: "engicite-logo.png", contentType: "image/png", cache: "public, max-age=86400" },
  };
  const publicFile = publicFiles[pathname];

  if (publicFile) {
    try {
      const asset = await readFile(path.join(root, publicFile.file));
      response.writeHead(200, {
        "Content-Type": publicFile.contentType,
        "Cache-Control": publicFile.cache,
        "X-Content-Type-Options": "nosniff",
      });
      response.end(asset);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Asset not found.");
    }
    return;
  }
  if (pathname !== "/" && pathname !== "/index.html") {
    response.writeHead(302, { Location: "/" });
    response.end();
    return;
  }
  try {
    const html = await readFile(path.join(root, "index.html"));
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    response.end(html);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("EngiCite is temporarily unavailable.");
  }
}).listen(port, host);
