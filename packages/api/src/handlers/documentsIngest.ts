import type { ClaudeDocumentContent } from "@pulse-brazil/application";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";
import { respondToError } from "./errorResponse.js";

interface DocumentsIngestRequestBody {
  content?: string;
  mimeType?: "text/plain" | "application/pdf";
  connectorSource?: string;
  originalFilename?: string;
  uploadedBy?: string;
}

/** content is raw text when mimeType is text/plain, or base64 when mimeType is application/pdf. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body as DocumentsIngestRequestBody | undefined;
  if (!body || typeof body.content !== "string" || !body.content.trim() || typeof body.connectorSource !== "string") {
    res.status(400).json({ error: "Request body must include content and connectorSource" });
    return;
  }
  if (body.mimeType !== "text/plain" && body.mimeType !== "application/pdf") {
    res.status(400).json({ error: 'mimeType must be "text/plain" or "application/pdf"' });
    return;
  }

  const documentContent: ClaudeDocumentContent =
    body.mimeType === "application/pdf" ? { kind: "pdf", base64Data: body.content } : { kind: "text", text: body.content };

  try {
    const result = await getCompositionRoot().processDocumentUpload.execute({
      documentContent,
      connectorSource: body.connectorSource,
      originalFilename: body.originalFilename,
      uploadedBy: body.uploadedBy,
    });
    res.status(201).json(result);
  } catch (error) {
    respondToError(res, "[api/documents/ingest POST]", error);
  }
}
