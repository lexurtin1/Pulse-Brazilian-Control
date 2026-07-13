import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ImportPipelineCsv } from "@pulse-brazil/application";
import { UlidIdGenerator } from "../adapters/UlidIdGenerator.js";
import { PostgresAccountRepository } from "../adapters/PostgresAccountRepository.js";
import { PostgresDealRepository } from "../adapters/PostgresDealRepository.js";
import { PostgresDocumentRepository } from "../adapters/PostgresDocumentRepository.js";
import { createPool } from "./pool.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..", "..", "..");

/**
 * One-off operational script: imports the real Pipeline CSV (see
 * claude/INTEGRATION_PLAN.md Feature 1 — "This FY" only, not "All Time",
 * which is a strict superset). Real export is Windows-1252/Latin-1, not
 * UTF-8 — decoded accordingly here, same as UploadFAB.tsx does client-side.
 *
 * Usage: DATABASE_URL=... npx tsx src/db/import-pipeline-csv.ts [csvPath]
 * Defaults to "Everything Brazil/Open Brazil Pipel This FY -2026-07-13.csv"
 * relative to the repo root.
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const csvPathArg = process.argv[2];
  const csvPath = csvPathArg
    ? path.resolve(csvPathArg)
    : path.join(REPO_ROOT, "Everything Brazil", "Open Brazil Pipel This FY -2026-07-13.csv");

  console.log(`Reading ${csvPath}...`);
  const buffer = await readFile(csvPath);
  const csvText = new TextDecoder("windows-1252").decode(buffer);

  const pool = createPool(connectionString);
  const deals = new PostgresDealRepository(pool);
  const documents = new PostgresDocumentRepository(pool);
  const accounts = new PostgresAccountRepository(pool);
  const idGenerator = new UlidIdGenerator();
  const importPipelineCsv = new ImportPipelineCsv(deals, documents, accounts, idGenerator);

  try {
    const result = await importPipelineCsv.execute({
      csvText,
      originalFilename: path.basename(csvPath),
      uploadedBy: "reconcile-salesforce-accounts-script",
    });
    console.log(`Source document:      ${result.sourceDocumentId}`);
    console.log(`Total rows:            ${result.totalRows}`);
    console.log(`Accepted rows:         ${result.acceptedRows}`);
    console.log(`Review-required count: ${result.reviewRequiredCount}`);
    console.log(`Rejected rows:         ${result.rejectedRows.length}`);
    if (result.rejectedRows.length > 0) {
      for (const row of result.rejectedRows) {
        console.log(`  row ${row.rowNumber}: ${row.errors.join("; ")}`);
      }
    }
    console.log("Done.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
