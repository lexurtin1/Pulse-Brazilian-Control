import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";
import { respondToError } from "./errorResponse.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = typeof req.query.id === "string" ? req.query.id : undefined;
  if (!id) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  try {
    const office = await getCompositionRoot().resolveAccountCoordinate.execute({ accountId: id });
    res.status(200).json(office);
  } catch (error) {
    respondToError(res, "[api/accounts/:id/resolve-coordinate POST]", error);
  }
}
