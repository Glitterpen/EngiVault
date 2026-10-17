import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMigration } from "./migration-safety.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");

const migrationFiles = (await readdir(migrationsDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const violations = [];
const reviewedDefinitions = [];

for (const file of migrationFiles) {
  const sql = await readFile(join(migrationsDirectory, file), "utf8");
  const result = inspectMigration(file, sql);
  violations.push(...result.violations.map((description) => `${file}: ${description}`));
  reviewedDefinitions.push(...result.reviewedDefinitions.map((reason) => `${file}: ${reason}`));
}

if (violations.length) {
  console.error("Destructive migration guard failed:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  console.error(
    "\nUse an additive migration, preserve existing Storage paths, and follow the approved export/deletion workflow for any intentional customer-data removal.",
  );
  process.exitCode = 1;
} else {
  console.log(`Checked ${migrationFiles.length} migrations: no unapproved destructive SQL pattern found.`);
  for (const definition of reviewedDefinitions) console.log(`Reviewed definition: ${definition}.`);
}
