import { unzip } from "./zip.js";

/**
 * Minimal DOCX reader — turns a Word document into the plain text Claude
 * reads, using the same zero-dependency ZIP handling as the Excel reader.
 *
 * Deliberately not a faithful renderer. Claude is reading this for meaning,
 * so what matters is that words stay in order and paragraph and table-cell
 * boundaries survive; bold, fonts, and numbering do not change what a call
 * note says. Anything more would be a document-conversion library, which is
 * exactly what this file exists to avoid depending on.
 */

const DOCUMENT_PART = "word/document.xml";

/** Order matters: &amp; must be last, or "&amp;lt;" would decode to "<". */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

/**
 * Flattens WordprocessingML to text.
 *
 * `<w:t>` holds the actual runs of text. Structural tags are turned into
 * whitespace rather than simply stripped, because deleting them outright
 * would weld the last word of one paragraph onto the first word of the next
 * ("...by FridayWe agreed..."), which changes what the document says.
 */
function documentXmlToText(xml: string): string {
  const body = xml
    // A tab or explicit break inside a run is a space.
    .replace(/<w:(?:tab|br)\b[^>]*\/?>/g, " ")
    // A cell's final paragraph ends the cell, not a line — leaving that break
    // in would put every table cell on a row of its own.
    .replace(/<\/w:p>\s*<\/w:tc>/g, "</w:tc>")
    .replace(/<\/w:tc>/g, "\t")
    // Paragraphs and table rows end a line. An empty paragraph is usually
    // written self-closing, and it is what separates the blocks of a note.
    .replace(/<w:p\b[^>]*\/>/g, "\n")
    .replace(/<\/w:(?:p|tr)>/g, "\n")
    // Keep only the text runs, then drop every remaining tag.
    .replace(/<w:t\b[^>]*>/g, "")
    .replace(/<\/w:t>/g, "")
    .replace(/<[^>]*>/g, "");

  return decodeXmlEntities(body)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, (match) => (match.includes("\t") ? "\t" : " ")).trim())
    .join("\n")
    // Collapse the runs of blank lines that empty paragraphs leave behind.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Throws with an actionable message rather than returning empty text — a silent empty ingest looks like Claude found nothing. */
export async function docxToText(buffer: ArrayBuffer): Promise<string> {
  const files = await unzip(buffer, "Word");
  const document = files.get(DOCUMENT_PART);
  if (!document) {
    throw new Error("This .docx has no word/document.xml — it may be corrupt, or saved in a different format with a .docx name.");
  }

  const text = documentXmlToText(new TextDecoder("utf-8").decode(document));
  if (!text) {
    throw new Error("This Word document has no readable text — if the content is a scanned image, upload it as a PDF or an image instead.");
  }
  return text;
}
