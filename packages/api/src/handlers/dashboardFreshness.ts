import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";
import { respondToError } from "./errorResponse.js";

/** Backs the header freshness ring — worst-of the Salesforce pipeline upload and market-research sweep, each independently thresholded. Always 200; a source that's never run just comes back with status "never" rather than the whole response 404ing. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const freshness = await getCompositionRoot().getDashboardFreshness.execute();
    res.status(200).json(freshness);
  } catch (error) {
    respondToError(res, "[api/dashboard/freshness]", error);
  }
}
