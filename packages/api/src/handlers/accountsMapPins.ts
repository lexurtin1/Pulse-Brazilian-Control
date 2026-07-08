import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const pins = await getCompositionRoot().listAccountsWithCoordinates.execute();
    res.status(200).json(pins);
  } catch (error) {
    console.error("[api/accounts/map-pins]", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
