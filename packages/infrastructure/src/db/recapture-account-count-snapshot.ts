import { AccountCountSnapshot, asAccountCountSnapshotId } from "@pulse-brazil/domain";
import { ulid } from "ulid";
import { PostgresAccountCountSnapshotRepository } from "../adapters/PostgresAccountCountSnapshotRepository.js";
import { PostgresAccountRepository } from "../adapters/PostgresAccountRepository.js";
import { createPool } from "./pool.js";

/**
 * One-off / occasional corrective script: AccountCountSnapshot is only
 * written automatically after an ImportLocationCsv run (see
 * claude/INTEGRATION_PLAN.md Feature 2) — anything that changes the
 * accounts table outside that flow (e.g. reconcile-salesforce-accounts.ts)
 * leaves the snapshot stale, since it's a point-in-time capture, not a
 * live query. Run this to recapture a fresh snapshot.
 *
 * "Active Accounts · BR" means the total set of Brazil accounts Pulse is
 * tracking, not a filter on AccountStatus.Active (a CRM lifecycle status
 * meaning "currently a live paying client") — the desk's real target list
 * is however many accounts exist, regardless of where each sits in the
 * sales lifecycle. Same total-count logic as ImportLocationCsv.
 *
 * Usage: DATABASE_URL=... npx tsx src/db/recapture-account-count-snapshot.ts
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const pool = createPool(connectionString);
  const accounts = new PostgresAccountRepository(pool);
  const snapshots = new PostgresAccountCountSnapshotRepository(pool);

  try {
    const allAccounts = await accounts.findAll();
    const count = allAccounts.length;

    const snapshot = AccountCountSnapshot.record({
      id: asAccountCountSnapshotId(ulid()),
      count,
      asOf: new Date(),
    });
    await snapshots.save(snapshot);

    console.log(`Total accounts: ${count}`);
    console.log(`Snapshot saved: ${snapshot.id} as of ${snapshot.asOf.toISOString()}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
