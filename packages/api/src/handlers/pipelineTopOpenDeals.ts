import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";

/** Returns `null` (200) when no Pipeline CSV has ever been uploaded — same empty-state convention as pipelineSummary. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const topDeals = await getCompositionRoot().getTopOpenDeals.execute();
    res.status(200).json(topDeals);
  } catch (error) {
    console.error("[api/pipeline/top-open-deals]", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
