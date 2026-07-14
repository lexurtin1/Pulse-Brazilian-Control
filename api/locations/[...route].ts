import type { VercelRequest, VercelResponse } from "@vercel/node";
import locationsImport from "../../packages/api/src/handlers/locationsImport.js";
import locationsMapPins from "../../packages/api/src/handlers/locationsMapPins.js";

/**
 * Single catch-all function for /api/locations/* — same reasoning as
 * api/pipeline/[...route].ts: the Vercel Hobby plan caps a deployment at 12
 * Serverless Functions, and adding api/dashboard/freshness.ts as its own
 * 13th function pushed the project over that limit. This frees a slot by
 * collapsing import/map-pins into one function while keeping the exact same
 * client-facing URLs.
 *
 * Parses the segment from req.url rather than req.query.route — see
 * api/pipeline/[...route].ts for why.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const pathname = (req.url ?? "").split("?")[0] ?? "";
  const segments = pathname.replace(/^\/api\/locations\/?/, "").split("/").filter(Boolean);
  const segment = segments[0];

  switch (segment) {
    case "import":
      return locationsImport(req, res);
    case "map-pins":
      return locationsMapPins(req, res);
    default:
      res.status(404).json({ error: "Not found" });
  }
}
