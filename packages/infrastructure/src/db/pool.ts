import { Pool } from "pg";

/**
 * Creates a pg Pool from an explicit connection string — a factory, not a
 * module-level singleton reading process.env directly, so CompositionRoot's
 * "accept env config as input" contract is real rather than decorative.
 *
 * Defaults to SSL with rejectUnauthorized: false, the standard requirement
 * for hosted Postgres (Supabase, Neon, RDS). Append `?sslmode=disable` to
 * the connection string for local development without SSL.
 */
export function createPool(connectionString: string): Pool {
  const useSsl = !connectionString.includes("sslmode=disable");
  return new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });
}
