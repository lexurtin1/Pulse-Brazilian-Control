import type { VercelRequest, VercelResponse } from "@vercel/node";
import dashboardFreshness from "../../packages/api/src/handlers/dashboardFreshness.js";
import dashboardLatestUpdate from "../../packages/api/src/handlers/dashboardLatestUpdate.js";

/**
 * Single catch-all function for /api/dashboard/* — the Vercel Hobby plan
 * caps a deployment at 12 Serverless Functions and this project sits
 * exactly at that cap, so a second dashboard endpoint cannot have a file of
 * its own. See api/pipeline's catch-all for the same constraint.
 *
 * Parses the segment from req.url rather than req.query.route: on this
 * project's builder, a `[...route].ts` catch-all's query key showed up as
 * the literal string "...route" instead of "route".
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const pathname = (req.url ?? "").split("?")[0] ?? "";
  const segments = pathname.replace(/^\/api\/dashboard\/?/, "").split("/").filter(Boolean);
  const segment = segments[0];

  switch (segment) {
    case "freshness":
      return dashboardFreshness(req, res);
    case "latest-update":
      return dashboardLatestUpdate(req, res);
    default:
      res.status(404).json({ error: "Not found" });
  }
}
