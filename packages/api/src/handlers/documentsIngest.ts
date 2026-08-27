import type { ClaudeDocumentContent, ClaudeImageMediaType } from "@pulse-brazil/application";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";
import { respondToError } from "./errorResponse.js";

const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
const ACCEPTED_MIME_TYPES = ["text/plain", "application/pdf", ...IMAGE_MIME_TYPES] as const;

type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

interface DocumentsIngestRequestBody {
  content?: string;
  mimeType?: AcceptedMimeType;
  connectorSource?: string;
  originalFilename?: string;
  uploadedBy?: string;
}

function isImageMimeType(mimeType: AcceptedMimeType): mimeType is ClaudeImageMediaType {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** content is raw text when mimeType is text/plain, or base64 for a PDF or an image. */
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
  const mimeType = body.mimeType;
  if (!mimeType || !(ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    res.status(400).json({ error: `mimeType must be one of: ${ACCEPTED_MIME_TYPES.join(", ")}` });
    return;
  }

  const documentContent: ClaudeDocumentContent = isImageMimeType(mimeType)
    ? { kind: "image", base64Data: body.content, mediaType: mimeType }
    : mimeType === "application/pdf"
      ? { kind: "pdf", base64Data: body.content }
      : { kind: "text", text: body.content };

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
