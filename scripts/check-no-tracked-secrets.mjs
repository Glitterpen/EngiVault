import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const permittedEnvironmentFiles = new Set([".env.example"]);
const findings = [];

const secretPatterns = [
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ["Resend API key", /\bre_[A-Za-z0-9_-]{24,}\b/],
  ["Paystack secret key", /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["private key material", new RegExp("-----BEGIN " + "PRIVATE KEY-----")],
];

for (const file of files) {
  const normalised = file.replaceAll("\\", "/");
  const basename = normalised.split("/").at(-1) ?? normalised;
  if (basename === ".env" || (basename.startsWith(".env.") && !permittedEnvironmentFiles.has(normalised))) {
    findings.push(`${normalised}: tracked environment file`);
    continue;
  }

  if (statSync(file).size > 2_000_000) continue;
  const content = readFileSync(file);
  if (content.includes(0)) continue;
  const text = content.toString("utf8");

  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) findings.push(`${normalised}: possible ${label}`);
  }
}

if (findings.length > 0) {
  console.error("Potential tracked secret material was found. Values are intentionally not printed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Checked ${files.length} tracked files: no supported secret pattern found.`);

