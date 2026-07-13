import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";

/** Returns `null` (200) when no Pipeline CSV has ever been uploaded — a valid empty state, not a 404 (nothing was "not found," nothing has happened yet). */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const summary = await getCompositionRoot().getPipelineSummary.execute();
    res.status(200).json(summary);
  } catch (error) {
    console.error("[api/pipeline/summary]", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
