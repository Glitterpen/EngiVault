import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");

const forbidden = [
  ["drops a table", /\bdrop\s+table\b/i],
  ["truncates data", /\btruncate\s+(?:table\s+)?/i],
  ["drops a column", /\balter\s+table\b[^;]*\bdrop\s+column\b/i],
  [
    "deletes durable tenant records",
    /\bdelete\s+from\s+(?:public\.)?(?:organisations|projects|documents|document_revisions|audit_events)\b/i,
  ],
  ["deletes Storage objects", /\bdelete\s+from\s+storage\.objects\b/i],
  ["deletes a Storage bucket", /\bdelete\s+from\s+storage\.buckets\b/i],
  ["rewrites a document Storage key", /\bupdate\s+(?:public\.)?document_revisions\b[^;]*\bset\s+[^;]*\bstorage_key\s*=/i],
  ["renames a Storage object", /\bupdate\s+storage\.objects\b[^;]*\bset\s+[^;]*\bname\s*=/i],
];

const migrationFiles = (await readdir(migrationsDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const violations = [];

for (const file of migrationFiles) {
  const sql = await readFile(join(migrationsDirectory, file), "utf8");
  for (const [description, pattern] of forbidden) {
    if (pattern.test(sql)) violations.push(`${file}: ${description}`);
  }
}

if (violations.length) {
  console.error("Destructive migration guard failed:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  console.error(
    "\nUse an additive migration, preserve existing Storage paths, and follow the approved export/deletion workflow for any intentional customer-data removal.",
  );
  process.exitCode = 1;
} else {
  console.log(`Checked ${migrationFiles.length} migrations: no destructive customer-data operation found.`);
}
