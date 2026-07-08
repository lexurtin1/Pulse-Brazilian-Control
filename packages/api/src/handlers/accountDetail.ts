import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const id = typeof req.query.id === "string" ? req.query.id : undefined;
  if (!id) {
    res.status(400).json({ error: "id is required" });
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
