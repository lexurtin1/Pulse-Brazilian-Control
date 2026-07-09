import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";
import { respondToError } from "./errorResponse.js";

/**
 * Triggered by Vercel Cron (crons.path in vercel.json), which fires an HTTP
 * GET at the scheduled time — not POST. Runs RunMarketResearchSweep for every
 * Active account. Per-account failures are already caught and collected
 * inside the use case itself, so a non-200 here means something more
 * fundamental broke (e.g. the database was unreachable), not a single bad
 * research query.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const result = await getCompositionRoot().runMarketResearchSweep.execute({});
    res.status(200).json(result);
  } catch (error) {
    respondToError(res, "[api/signals/research-sweep GET]", error);
  }
}
