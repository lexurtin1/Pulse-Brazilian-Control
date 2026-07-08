import { CompositionRoot } from "@pulse-brazil/infrastructure";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

let root: CompositionRoot | undefined;

/**
 * Module-scope singleton so warm serverless invocations reuse the same pg
 * Pool instead of opening a new one per request. The current handlers are
 * all Postgres-only (accounts, signals) and never call the Claude/geocoder/
 * market-research use cases, so those three keys are passed as empty
 * placeholders rather than required here — CompositionRoot's adapters only
 * store a key at construction, no network call fires until their specific
 * use case executes. Revisit with real keys once a handler needs one.
 */
export function getCompositionRoot(): CompositionRoot {
  if (!root) {
    root = new CompositionRoot({
      databaseUrl: requireEnv("DATABASE_URL"),
      anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
      perplexityApiKey: process.env.PERPLEXITY_API_KEY ?? "",
    });
  }
  return root;
}
