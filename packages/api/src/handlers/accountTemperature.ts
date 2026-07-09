import type { UpdateAccountTemperatureCommand } from "@pulse-brazil/application";
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

  const body = req.body as Omit<UpdateAccountTemperatureCommand, "accountId"> | undefined;
  if (
    !body ||
    typeof body.band !== "string" ||
    typeof body.rationale !== "string" ||
    typeof body.assessedBy !== "string" ||
    typeof body.confidenceScore !== "number"
  ) {
    res.status(400).json({ error: "Request body must include band, rationale, assessedBy, and confidenceScore" });
    return;
  }

  try {
    const assessment = await getCompositionRoot().updateAccountTemperature.execute({ ...body, accountId: id });
    res.status(201).json(assessment);
  } catch (error) {
    respondToError(res, "[api/accounts/:id/temperature POST]", error);
  }
}
