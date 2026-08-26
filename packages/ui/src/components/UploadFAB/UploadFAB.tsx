import { useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { Plus, X, UploadCloud } from "lucide-react";
import type {
  ImportLocationCsvResultDto,
  ImportPipelineCsvResultDto,
  ProcessDocumentUploadResultDto,
  ReconcileSalesforceAccountsResultDto,
} from "@pulse-brazil/application";
import {
  looksLikePipelineCsv,
  looksLikeSalesforceAccountCsv,
  parseCsv,
  REQUIRED_PIPELINE_CSV_COLUMNS,
  validateLocationCsvHeaders,
  validatePipelineCsvHeaders,
} from "@pulse-brazil/application";
import { importLocationCsv, importPipelineCsv, ingestDocument, reconcileSalesforceAccounts } from "../../api/client";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { docxToText } from "../../utils/docx";
import { formatEnumLabel } from "../../utils/formatEnumLabel";
import { xlsxToCsvText } from "../../utils/xlsx";
import "./UploadFAB.css";

interface UploadFABProps {
  /** Called after a CSV import or document ingest completes successfully, so the caller can refresh map pins / the signal feed. */
  onImported?: () => void;
  /** "fab" (default): floating circular trigger. "inline": flows as a normal button, for the Command Centre's Feed Controls card. */
  variant?: "fab" | "inline";
}

const TITLE_ID = "upload-sheet-title";

/**
 * Every upload is a document upload. The uploader used to pick a source type
 * by hand, but nothing downstream needed an answer a person could give
 * better than the file itself: Claude now classifies what a document is (see
 * claude/prompts/document-reading/v1), and a spreadsheet is routed by its
 * columns. ManualEntry is deliberately not reachable here — signals
 * extracted from a document are always MachineDerived, and
 * ProcessDocumentUpload rejects that pairing outright.
 */
const CONNECTOR_SOURCE = "DocumentUpload";

type SubmitResult =
  | { kind: "csv"; data: ImportLocationCsvResultDto }
  | { kind: "pipeline"; data: ImportPipelineCsvResultDto }
  | { kind: "accounts"; data: ReconcileSalesforceAccountsResultDto }
  | { kind: "document"; data: ProcessDocumentUploadResultDto };

/** Strips the "data:<mime>;base64," prefix FileReader.readAsDataURL adds. */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

interface TabularUpload {
  kind: "location" | "pipeline" | "accounts";
  csvText: string;
}

/** Formats that go to a row importer rather than to Claude's document reader. */
const SPREADSHEET_EXTENSIONS = [".csv", ".xlsx", ".xlsm"];

/** Plain-text formats the browser can decode as-is. */
const TEXT_EXTENSIONS = [".txt", ".md", ".eml"];

/** Image types Claude reads natively — a photographed or screenshotted page is still a document. */
const IMAGE_MIME_BY_EXTENSION: Record<string, "image/png" | "image/jpeg" | "image/webp" | "image/gif"> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Formats someone is likely to try that this app genuinely cannot read, each with the way out. */
const UNSUPPORTED_EXTENSIONS: Record<string, string> = {
  ".xls": "This is the older .xls format — re-save it as .xlsx from Excel and upload that.",
  ".doc": "This is the older .doc format — re-save it as .docx from Word and upload that.",
  ".pptx": "PowerPoint files cannot be read directly — export the deck as a PDF and upload that.",
  ".ppt": "PowerPoint files cannot be read directly — export the deck as a PDF and upload that.",
  ".pages": "Pages documents cannot be read directly — export as .docx or PDF and upload that.",
  ".numbers": "Numbers spreadsheets cannot be read directly — export as .xlsx or .csv and upload that.",
};

const ACCEPT_ATTRIBUTE = [
  ".csv,text/csv",
  ".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt,text/plain,.md,.eml",
  ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf,application/pdf",
  ".png,.jpg,.jpeg,.webp,.gif,image/*",
].join(",");

function extensionOf(filename: string): string {
  const lowerName = filename.toLowerCase();
  const dot = lowerName.lastIndexOf(".");
  return dot === -1 ? "" : lowerName.slice(dot);
}

function isSpreadsheet(filename: string): boolean {
  return SPREADSHEET_EXTENSIONS.includes(extensionOf(filename));
}

/** Every spreadsheet contract the importers understand — used to find the header row inside an Excel report. */
function isKnownTabularHeader(headers: string[]): boolean {
  return (
    looksLikePipelineCsv(headers) ||
    looksLikeSalesforceAccountCsv(headers) ||
    validateLocationCsvHeaders(headers).length === 0
  );
}

/**
 * Routes a sheet by its columns. Pipeline is tested first because it is the
 * most specific contract, then the account export, and location last as the
 * fallback — the same precedence isKnownTabularHeader implies.
 */
function routeTabular(headers: string[]): TabularUpload["kind"] {
  if (looksLikePipelineCsv(headers)) return "pipeline";
  if (looksLikeSalesforceAccountCsv(headers)) return "accounts";
  return "location";
}

/**
 * Names the missing columns when a sheet is *nearly* a pipeline export.
 * Salesforce opportunity reports come in several column sets, and only some
 * carry Expected Revenue / Probability — telling the user which column is
 * absent is the difference between a fixable export and a dead end.
 */
function explainHeaderMiss(headers: string[]): string | undefined {
  // "Opportunity Name" is what separates an opportunity report from an account
  // one — both carry "Account Name", so that column alone proves nothing.
  const isOpportunityReport = headers.some((header) => header.toLowerCase() === "opportunity name");
  const missing = validatePipelineCsvHeaders(headers);
  if (!isOpportunityReport || missing.length === 0 || missing.length === REQUIRED_PIPELINE_CSV_COLUMNS.length) {
    return undefined;
  }
  return (
    `this looks like a Salesforce opportunity report, but the pipeline importer needs ` +
    `${missing.length === 1 ? "a column" : "columns"} it doesn't have: ${missing.join(", ")}. ` +
    `Add ${missing.length === 1 ? "it" : "them"} to the report's columns in Salesforce and export again`
  );
}

/**
 * Real Salesforce CSV exports are Windows-1252/Latin-1, not UTF-8 — decoding
 * as UTF-8 corrupts accented account names (e.g. "Itaú"). Header names are
 * plain ASCII either way, so a first UTF-8 decode is safe for the routing
 * sniff; only the two Salesforce contracts get re-decoded as windows-1252
 * for the text actually sent to the importer. Location CSVs are unaffected,
 * decoded as UTF-8 as before.
 */
async function readCsvFile(file: File): Promise<TabularUpload> {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder("utf-8").decode(buffer);
  const { headers } = parseCsv(utf8Text);
  const kind = routeTabular(headers);
  if (kind === "location") {
    return { kind, csvText: utf8Text };
  }
  return { kind, csvText: new TextDecoder("windows-1252").decode(buffer) };
}

/**
 * Excel uploads join the CSV path rather than getting their own: the sheet
 * is converted to the same CSV text and routed by the same header sniff, so
 * one file format decision — not two — decides how a pipeline import
 * behaves. No encoding dance here; xlsx XML is always UTF-8.
 */
async function readXlsxFile(file: File): Promise<TabularUpload> {
  const csvText = await xlsxToCsvText(await file.arrayBuffer(), isKnownTabularHeader, explainHeaderMiss);
  const { headers } = parseCsv(csvText);
  return { kind: routeTabular(headers), csvText };
}

export function UploadFAB({ onImported, variant = "fab" }: UploadFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  function close() {
    setIsOpen(false);
  }

  useDialogA11y(sheetRef, isOpen, close);

  function reset() {
    setFile(null);
    setSubmitError(null);
    setSubmitResult(null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      setSubmitError(null);
      setSubmitResult(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setSubmitError("Choose a file first.");
      return;
    }

    const extension = extensionOf(file.name);
    const unsupported = UNSUPPORTED_EXTENSIONS[extension];
    if (unsupported) {
      setSubmitError(unsupported);
      return;
    }

    const imageMimeType = IMAGE_MIME_BY_EXTENSION[extension];
    const isCsv = extension === ".csv";
    const isExcel = extension === ".xlsx" || extension === ".xlsm";
    const isPdf = extension === ".pdf";
    const isWord = extension === ".docx";
    const isText = TEXT_EXTENSIONS.includes(extension);
    if (!isCsv && !isExcel && !isPdf && !isWord && !isText && !imageMimeType) {
      setSubmitError("Only .csv, .xlsx, .docx, .txt, .md, .eml, .pdf, and image files can be uploaded right now.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitResult(null);

    try {
      if (isCsv || isExcel) {
        const { kind, csvText } = isExcel ? await readXlsxFile(file) : await readCsvFile(file);
        if (kind === "pipeline") {
          setSubmitResult({ kind: "pipeline", data: await importPipelineCsv({ csvText, originalFilename: file.name }) });
        } else if (kind === "accounts") {
          setSubmitResult({ kind: "accounts", data: await reconcileSalesforceAccounts({ csvText }) });
        } else {
          setSubmitResult({ kind: "csv", data: await importLocationCsv({ csvText, originalFilename: file.name }) });
        }
      } else {
        // Everything else is a document for Claude to read. PDFs and images
        // go as base64 for it to read natively; .docx is flattened to text
        // here because the API takes no Word content block.
        const content =
          isPdf || imageMimeType
            ? await readFileAsBase64(file)
            : isWord
              ? await docxToText(await file.arrayBuffer())
              : await file.text();
        const data = await ingestDocument({
          content,
          mimeType: imageMimeType ?? (isPdf ? "application/pdf" : "text/plain"),
          connectorSource: CONNECTOR_SOURCE,
          originalFilename: file.name,
        });
        setSubmitResult({ kind: "document", data });
      }
      setFile(null);
      onImported?.();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {variant === "fab" ? (
        <button type="button" className="upload-fab" aria-label="Upload document" onClick={() => setIsOpen(true)}>
          <Plus size={22} strokeWidth={2.25} />
        </button>
      ) : (
        <button type="button" className="feed-action-button feed-action-button--upload" onClick={() => setIsOpen(true)}>
          <UploadCloud size={16} strokeWidth={2} />
          <span>Upload document</span>
        </button>
      )}

      {isOpen && (
        <div
          className="upload-sheet-backdrop"
          onClick={() => {
            close();
            reset();
          }}
        >
          <div
            ref={sheetRef}
            className="upload-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={TITLE_ID}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="upload-sheet__handle-row">
              <span className="upload-sheet__handle" aria-hidden="true" />
              <button
                type="button"
                className="upload-sheet__close"
                aria-label="Close"
                onClick={() => {
                  close();
                  reset();
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form className="upload-sheet__form" onSubmit={handleSubmit}>
              <h2 id={TITLE_ID} className="upload-sheet__title">
                Add a source document
              </h2>

              <div
                className="upload-sheet__dropzone"
                data-active={isDragActive || undefined}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={handleDrop}
              >
                <UploadCloud size={28} strokeWidth={1.5} />
                <p>{file?.name ?? "Drag a file here, or click to browse"}</p>
                <input
                  type="file"
                  accept={ACCEPT_ATTRIBUTE}
                  className="upload-sheet__file-input"
                  aria-label="Choose file"
                  onChange={(event) => {
                    const chosen = event.target.files?.[0] ?? null;
                    setFile(chosen);
                    setSubmitError(null);
                    setSubmitResult(null);
                  }}
                />
              </div>

              {!file && (
                <p className="upload-sheet__hint">
                  Spreadsheets are imported directly — a Salesforce pipeline export, a Salesforce account export, or Brazil
                  location data, detected from its columns. Anything else (Word, PDF, email, notes, or a photo of a page) is
                  read by Claude, which works out what it is, files the signals it finds, and refreshes the Brazil update.
                </p>
              )}
              {file && isSpreadsheet(file.name) && (
                <p className="upload-sheet__hint">
                  This is imported as rows, not read by Claude. Whether it is pipeline, account, or location data is detected
                  from its columns, and in an Excel export the header row is found wherever Salesforce put it — a title block
                  and subtotal rows are skipped rather than imported.
                </p>
              )}
              {file && !isSpreadsheet(file.name) && (
                <p className="upload-sheet__hint">
                  Claude will read this, work out what kind of document it is, and extract signals for accounts already in
                  Pulse. It won&rsquo;t create new accounts, and anything it can&rsquo;t match to an existing account is
                  reported rather than guessed at. If it records contact with a counterparty, the Brazil update is refreshed
                  too — except for anything you have edited by hand.
                </p>
              )}

              {submitError && (
                <p className="upload-sheet__error" role="alert">
                  {submitError}
                </p>
              )}

              {submitResult?.kind === "csv" && (
                <div className="upload-sheet__result" role="status">
                  <p>
                    <strong>{submitResult.data.acceptedRows}</strong> of {submitResult.data.totalRows} row
                    {submitResult.data.totalRows === 1 ? "" : "s"} imported.
                  </p>
                  {submitResult.data.reviewRequiredCount > 0 && (
                    <p>{submitResult.data.reviewRequiredCount} record(s) flagged for review.</p>
                  )}
                  {submitResult.data.rejectedRows.length > 0 && (
                    <details>
                      <summary>
                        {submitResult.data.rejectedRows.length} row{submitResult.data.rejectedRows.length === 1 ? "" : "s"}{" "}
                        rejected
                      </summary>
                      <ul className="upload-sheet__result-errors">
                        {submitResult.data.rejectedRows.map((row) => (
                          <li key={row.rowNumber}>
                            Row {row.rowNumber}: {row.errors.join("; ")}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              {submitResult?.kind === "pipeline" && (
                <div className="upload-sheet__result" role="status">
                  <p>
                    <strong>{submitResult.data.acceptedRows}</strong> of {submitResult.data.totalRows} deal
                    {submitResult.data.totalRows === 1 ? "" : "s"} imported.
                  </p>
                  {submitResult.data.reviewRequiredCount > 0 && (
                    <p>{submitResult.data.reviewRequiredCount} deal(s) flagged for review.</p>
                  )}
                  {submitResult.data.rejectedRows.length > 0 && (
                    <details>
                      <summary>
                        {submitResult.data.rejectedRows.length} row{submitResult.data.rejectedRows.length === 1 ? "" : "s"}{" "}
                        rejected
                      </summary>
                      <ul className="upload-sheet__result-errors">
                        {submitResult.data.rejectedRows.map((row) => (
                          <li key={row.rowNumber}>
                            Row {row.rowNumber}: {row.errors.join("; ")}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              {submitResult?.kind === "accounts" && (
                <div className="upload-sheet__result" role="status">
                  <p>
                    <strong>{submitResult.data.updatedAccountIds.length}</strong> account
                    {submitResult.data.updatedAccountIds.length === 1 ? "" : "s"} enriched — client types on the map are now
                    up to date.
                  </p>
                  {submitResult.data.unmatchedAccountNames.length > 0 && (
                    <details>
                      <summary>
                        {submitResult.data.unmatchedAccountNames.length} name
                        {submitResult.data.unmatchedAccountNames.length === 1 ? "" : "s"} matched no account in Pulse
                      </summary>
                      <ul className="upload-sheet__result-errors">
                        {submitResult.data.unmatchedAccountNames.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {submitResult.data.rejectedRows.length > 0 && (
                    <details>
                      <summary>
                        {submitResult.data.rejectedRows.length} row{submitResult.data.rejectedRows.length === 1 ? "" : "s"}{" "}
                        rejected
                      </summary>
                      <ul className="upload-sheet__result-errors">
                        {submitResult.data.rejectedRows.map((row) => (
                          <li key={row.rowNumber}>
                            Row {row.rowNumber}: {row.errors.join("; ")}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              {submitResult?.kind === "document" && (
                <div className="upload-sheet__result" role="status">
                  <p>
                    Claude read this as <strong>{formatEnumLabel(submitResult.data.documentType)}</strong>.
                  </p>
                  <p>
                    <strong>{submitResult.data.signalsCreated.length}</strong> signal
                    {submitResult.data.signalsCreated.length === 1 ? "" : "s"} extracted
                    {submitResult.data.latestUpdateRefreshed ? ", and the Brazil update was refreshed." : "."}
                  </p>
                  {submitResult.data.signalsCreated.length > 0 && (
                    <ul className="upload-sheet__result-errors">
                      {submitResult.data.signalsCreated.map((signal) => (
                        <li key={signal.id}>{signal.title}</li>
                      ))}
                    </ul>
                  )}
                  {submitResult.data.unmatchedAccountMentions.length > 0 && (
                    <details>
                      <summary>
                        {submitResult.data.unmatchedAccountMentions.length} mention
                        {submitResult.data.unmatchedAccountMentions.length === 1 ? "" : "s"} didn&rsquo;t match a known
                        account
                      </summary>
                      <ul className="upload-sheet__result-errors">
                        {submitResult.data.unmatchedAccountMentions.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              <button type="submit" className="upload-sheet__submit" disabled={isSubmitting}>
                {isSubmitting ? "Uploading…" : "Add to Pulse"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
