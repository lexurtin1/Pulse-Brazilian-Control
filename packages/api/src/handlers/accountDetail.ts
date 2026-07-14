import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";
import { respondToError } from "./errorResponse.js";

/**
 * GET returns the account detail. POST triggers the "Information Sweep" —
 * a real Perplexity call scoped to this one account — sharing this file
 * rather than getting its own route, per the Vercel Hobby plan's 12-function
 * cap (see api/pipeline's catch-all for the same constraint).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = typeof req.query.id === "string" ? req.query.id : undefined;
  if (!id) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  if (req.method === "POST") {
    try {
      const brief = await getCompositionRoot().runAccountResearchSweep.execute(id);
      res.status(200).json(brief);
    } catch (error) {
      respondToError(res, "[api/accounts/:id POST]", error);
    }
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const account = await getCompositionRoot().getAccountDetail.execute(id);
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.status(200).json(account);
  } catch (error) {
    console.error("[api/accounts/:id]", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
