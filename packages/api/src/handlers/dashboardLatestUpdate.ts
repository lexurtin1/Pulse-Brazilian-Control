import type { UpdateExpansionUpdateCommand } from "@pulse-brazil/application";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";
import { respondToError } from "./errorResponse.js";

const EDITABLE_FIELDS = ["headline", "lastContact", "nextMeeting", "awaitingInternal", "nextActions"] as const;
/** A body may also do nothing but release pins — that is a real change, not an empty patch. */
const PATCHABLE_KEYS = [...EDITABLE_FIELDS, "unpinFields"] as const;

/**
 * GET returns `null` (200) before anything has been ingested — same
 * empty-state convention as pipelineSummary.
 *
 * PATCH, not PUT: the body names only the fields being changed, and the use
 * case pins exactly those. A PUT would make "field absent" and "field
 * cleared" indistinguishable, which is the one distinction this card's
 * edit-versus-regenerate rule depends on.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === "GET") {
    try {
      const update = await getCompositionRoot().getLatestExpansionUpdate.execute();
      res.status(200).json(update);
    } catch (error) {
      console.error("[api/dashboard/latest-update]", error);
      res.status(500).json({ error: "Internal server error" });
    }
    return;
  }

  if (req.method === "PATCH") {
    const body = req.body as UpdateExpansionUpdateCommand | undefined;
    if (!body || typeof body !== "object" || !PATCHABLE_KEYS.some((field) => field in body)) {
      res.status(400).json({ error: `Request body must name at least one of: ${PATCHABLE_KEYS.join(", ")}` });
      return;
    }
    try {
      const update = await getCompositionRoot().saveExpansionUpdateEdits.execute(body);
      res.status(200).json(update);
    } catch (error) {
      respondToError(res, "[api/dashboard/latest-update PATCH]", error);
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
