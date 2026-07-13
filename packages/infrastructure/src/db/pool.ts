import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Neon's driver speaks Postgres over a WebSocket tunnel (wss://, port 443)
// rather than the raw Postgres wire protocol (port 5432). Same pg-compatible
// Pool/Client API (BEGIN/COMMIT, pool.connect(), etc.) — existing callers
// (run-migrations.ts, PostgresDealRepository, ...) are unchanged — but it
// gets through networks/firewalls that only permit standard HTTPS-style TLS
// ports, which the raw 5432 protocol does not. `webSocketConstructor` is set
// explicitly (rather than relying on Node's native WebSocket) so this works
// the same on any Node runtime version, including whatever Vercel's
// serverless functions use.
neonConfig.webSocketConstructor = ws;

/**
 * Creates a Neon-serverless Pool from an explicit connection string — a
 * factory, not a module-level singleton reading process.env directly, so
 * CompositionRoot's "accept env config as input" contract is real rather
 * than decorative.
 */
export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}
