import { ValidationError } from "@pulse-brazil/application";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";

interface ImportPipelineCsvRequestBody {
  csvText?: string;
  originalFilename?: string;
  uploadedBy?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body as ImportPipelineCsvRequestBody | undefined;
  if (!body || typeof body.csvText !== "string") {
    res.status(400).json({ error: "Request body must include csvText as a string" });
    return;
  }

  try {
    const result = await getCompositionRoot().importPipelineCsv.execute({
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
    console.error("[api/pipeline/import]", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
