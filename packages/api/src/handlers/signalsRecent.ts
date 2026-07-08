import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";

const DEFAULT_LIMIT = 50;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const limitParam = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
  const limit = limitParam && Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT;
  try {
    const signals = await getCompositionRoot().listRecentSignals.execute(limit);
    res.status(200).json(signals);
  } catch (error) {
    console.error("[api/signals/recent]", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
