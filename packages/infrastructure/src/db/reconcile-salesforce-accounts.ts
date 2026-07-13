import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ReconcileSalesforceAccounts } from "@pulse-brazil/application";
import { createPool } from "./pool.js";
import { UlidIdGenerator } from "../adapters/UlidIdGenerator.js";
import { PostgresAccountRepository } from "../adapters/PostgresAccountRepository.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..", "..", "..");

/**
 * One-off operational script: enriches the 44 already-backfilled Brazil
 * accounts with real Salesforce account-export metadata (client types,
 * owner, cohort year, open-opportunity count, status, external reference,
 * and an address/coordinate only where none exists yet). Run
 * `npm run migrate --workspace=@pulse-brazil/infrastructure` first if
 * migration 015 hasn't landed yet — this script does not run migrations.
 *
 * Usage: DATABASE_URL=... npx tsx src/db/reconcile-salesforce-accounts.ts [csvPath]
 * Defaults to "Everything Brazil/Brazil_Accounts_Enriched_2026-07-09 (1).csv"
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
    : path.join(REPO_ROOT, "Everything Brazil", "Brazil_Accounts_Enriched_2026-07-09 (1).csv");

  console.log(`Reading ${csvPath}...`);
  const csvText = await readFile(csvPath, "utf-8");

  const pool = createPool(connectionString);
  const accounts = new PostgresAccountRepository(pool);
  const idGenerator = new UlidIdGenerator();
  const reconcile = new ReconcileSalesforceAccounts(accounts, idGenerator);

  try {
    const result = await reconcile.execute({ csvText });
    console.log(`Total rows:        ${result.totalRows}`);
    console.log(`Matched/updated:   ${result.matchedCount}`);
    console.log(`Rejected rows:     ${result.rejectedRows.length}`);
    if (result.rejectedRows.length > 0) {
      for (const row of result.rejectedRows) {
        console.log(`  row ${row.rowNumber}: ${row.errors.join("; ")}`);
      }
    }
    console.log(`Unmatched names:   ${result.unmatchedAccountNames.length}`);
    if (result.unmatchedAccountNames.length > 0) {
      for (const name of result.unmatchedAccountNames) {
        console.log(`  - ${name}`);
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
