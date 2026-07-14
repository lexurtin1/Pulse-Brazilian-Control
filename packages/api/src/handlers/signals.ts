import type { CreateSignalCommand } from "@pulse-brazil/application";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";
import { respondToError } from "./errorResponse.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === "DELETE") {
    try {
      await getCompositionRoot().deleteAllSignals.execute();
      res.status(200).json({ deleted: true });
    } catch (error) {
      respondToError(res, "[api/signals DELETE]", error);
    }
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body as CreateSignalCommand | undefined;
  if (
    !body ||
    typeof body.source !== "string" ||
    typeof body.type !== "string" ||
    typeof body.title !== "string" ||
    typeof body.summary !== "string" ||
    typeof body.origin !== "string" ||
    typeof body.confidenceScore !== "number"
  ) {
    res.status(400).json({ error: "Request body must include source, type, title, summary, origin, and confidenceScore" });
    return;
  }

  try {
    const signal = await getCompositionRoot().createSignal.execute(body);
    res.status(201).json(signal);
  } catch (error) {
    respondToError(res, "[api/signals POST]", error);
  }
}
