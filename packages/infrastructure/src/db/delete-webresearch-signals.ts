import { createPool } from "./pool.js";

/**
 * One-off operational script: deletes every signal row created by the old
 * per-account Perplexity sweep (source = 'WebResearch'), including ones that
 * did find real account info — the sweep now runs 6 fixed market-wide
 * queries instead, and the old account-specific rows (many of them just
 * "nothing was found" noise) have no place in that model. Canonical
 * account_signals rows are removed automatically by their cascading foreign
 * key when a Signal is deleted.
 *
 * Defaults to a dry run (just counts and prints matching rows). Pass
 * --confirm to actually delete.
 *
 * Usage: DATABASE_URL=... npx tsx src/db/delete-webresearch-signals.ts [--confirm]
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  const confirmed = process.argv.includes("--confirm");

  const pool = createPool(connectionString);

  try {
    const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM signals WHERE source = 'WebResearch'");
    const matching = rows[0]?.n ?? 0;

    if (!confirmed) {
      console.log(`Dry run: ${matching} WebResearch signal(s) would be deleted. Re-run with --confirm to actually delete.`);
      return;
    }

    const { rowCount } = await pool.query("DELETE FROM signals WHERE source = 'WebResearch'");
    console.log(`Deleted ${rowCount} WebResearch signal(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
