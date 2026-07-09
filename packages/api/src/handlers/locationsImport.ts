import { ValidationError } from "@pulse-brazil/application";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";

interface ImportLocationCsvRequestBody {
  csvText?: string;
  originalFilename?: string;
  uploadedBy?: string;
}

/** The system's first write endpoint. Vercel parses a JSON request body automatically for application/json requests. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body as ImportLocationCsvRequestBody | undefined;
  if (!body || typeof body.csvText !== "string") {
    res.status(400).json({ error: "Request body must include csvText as a string" });
    return;
  }

  try {
    const result = await getCompositionRoot().importLocationCsv.execute({
      csvText: body.csvText,
      originalFilename: body.originalFilename,
      uploadedBy: body.uploadedBy,
    });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error("[api/locations/import]", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
