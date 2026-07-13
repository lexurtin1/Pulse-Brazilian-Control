import type { VercelRequest, VercelResponse } from "@vercel/node";
import pipelineImport from "../../packages/api/src/handlers/pipelineImport.js";
import pipelineSummary from "../../packages/api/src/handlers/pipelineSummary.js";
import pipelineTopOpenDeals from "../../packages/api/src/handlers/pipelineTopOpenDeals.js";

/**
 * Single catch-all function for /api/pipeline/* — the Vercel Hobby plan
 * caps a deployment at 12 Serverless Functions, and giving each pipeline
 * endpoint its own file (as every other route in this project does) pushed
 * the project over that limit. This collapses import/summary/top-open-deals
 * into one function while keeping the exact same client-facing URLs.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const route = req.query.route;
  const segment = Array.isArray(route) ? route[0] : route;

  switch (segment) {
    case "import":
      return pipelineImport(req, res);
    case "summary":
      return pipelineSummary(req, res);
    case "top-open-deals":
      return pipelineTopOpenDeals(req, res);
    default:
      res.status(404).json({ error: "Not found" });
  }
}
