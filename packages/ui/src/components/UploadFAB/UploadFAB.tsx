import { useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { Plus, X, UploadCloud } from "lucide-react";
import type {
  AccountSummaryDto,
  ImportLocationCsvResultDto,
  ImportPipelineCsvResultDto,
  ProcessDocumentUploadResultDto,
} from "@pulse-brazil/application";
import { looksLikePipelineCsv, parseCsv } from "@pulse-brazil/application";
import { importLocationCsv, importPipelineCsv, ingestDocument } from "../../api/client";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { formatEnumLabel } from "../../utils/formatEnumLabel";
import "./UploadFAB.css";

interface UploadFABProps {
  accountsForLinking: AccountSummaryDto[];
  /** Called after a CSV import or document ingest completes successfully, so the caller can refresh map pins / the signal feed. */
  onImported?: () => void;
  /** "fab" (default): floating circular trigger. "inline": flows as a normal button, for the Command Centre's Feed Controls card. */
  variant?: "fab" | "inline";
}

const SOURCE_TYPES = ["DocumentUpload", "EmailForward", "ManualEntry", "WebResearch", "Other"];
const TITLE_ID = "upload-sheet-title";
const SOURCE_TYPE_LEGEND_ID = "upload-sheet-source-type-legend";

type SubmitResult =
  | { kind: "csv"; data: ImportLocationCsvResultDto }
  | { kind: "pipeline"; data: ImportPipelineCsvResultDto }
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

/**
 * Real Pipeline CSV exports from Salesforce are Windows-1252/Latin-1, not
 * UTF-8 — decoding as UTF-8 corrupts accented account names (e.g. "Itaú").
 * Header names are plain ASCII either way, so a first UTF-8 decode is safe
 * for the routing sniff; only Pipeline CSVs get re-decoded as windows-1252
 * for the text actually sent to the importer. Location CSVs are unaffected,
 * decoded as UTF-8 as before.
 */
async function readCsvFile(file: File): Promise<{ kind: "location" | "pipeline"; csvText: string }> {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder("utf-8").decode(buffer);
  const { headers } = parseCsv(utf8Text);
  if (looksLikePipelineCsv(headers)) {
    return { kind: "pipeline", csvText: new TextDecoder("windows-1252").decode(buffer) };
  }
  return { kind: "location", csvText: utf8Text };
}

export function UploadFAB({ accountsForLinking, onImported, variant = "fab" }: UploadFABProps) {
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

    const lowerName = file.name.toLowerCase();
    const isCsv = lowerName.endsWith(".csv");
    const isPdf = lowerName.endsWith(".pdf");
    const isText = lowerName.endsWith(".txt") || lowerName.endsWith(".md");
    if (!isCsv && !isPdf && !isText) {
      setSubmitError("Only .csv, .txt, .md, and .pdf files can be uploaded right now.");
      return;
    }

    const connectorSource = String(new FormData(event.currentTarget).get("sourceType") ?? SOURCE_TYPES[0]);

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitResult(null);

    try {
      if (isCsv) {
        const { kind, csvText } = await readCsvFile(file);
        if (kind === "pipeline") {
          const data = await importPipelineCsv({ csvText, originalFilename: file.name });
          setSubmitResult({ kind: "pipeline", data });
        } else {
          const data = await importLocationCsv({ csvText, originalFilename: file.name });
          setSubmitResult({ kind: "csv", data });
        }
      } else if (isPdf) {
        const content = await readFileAsBase64(file);
        const data = await ingestDocument({ content, mimeType: "application/pdf", connectorSource, originalFilename: file.name });
        setSubmitResult({ kind: "document", data });
      } else {
        const content = await file.text();
        const data = await ingestDocument({ content, mimeType: "text/plain", connectorSource, originalFilename: file.name });
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
        <button type="button" className="feed-action-button" onClick={() => setIsOpen(true)}>
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
                  accept=".csv,text/csv,.txt,text/plain,.md,.pdf,application/pdf"
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

              {file?.name.toLowerCase().endsWith(".csv") && (
                <p className="upload-sheet__hint">
                  CSV files are imported directly — whether this is Brazil location data or Salesforce pipeline data is
                  detected automatically from its columns. Source type and account link below aren't used for this format.
                </p>
              )}
              {file && !file.name.toLowerCase().endsWith(".csv") && (
                <p className="upload-sheet__hint">
                  Claude will read this document and extract signals for accounts already in Pulse — it won't create new
                  accounts, and anything it can't match to an existing account is reported, not guessed at.
                </p>
              )}

              <fieldset className="upload-sheet__field upload-sheet__source-type">
                <legend id={SOURCE_TYPE_LEGEND_ID}>Source type</legend>
                <div className="upload-sheet__pill-group" role="radiogroup" aria-labelledby={SOURCE_TYPE_LEGEND_ID}>
                  {SOURCE_TYPES.map((type, index) => (
                    <span key={type} className="upload-sheet__pill">
                      <input
                        type="radio"
                        id={`source-type-${type}`}
                        name="sourceType"
                        value={type}
                        defaultChecked={index === 0}
                        className="upload-sheet__pill-input"
                      />
                      <label htmlFor={`source-type-${type}`} className="upload-sheet__pill-label">
                        {formatEnumLabel(type)}
                      </label>
                    </span>
                  ))}
                </div>
              </fieldset>

              <label className="upload-sheet__field">
                <span>Link to account (optional)</span>
                {accountsForLinking.length === 0 ? (
                  <select disabled defaultValue="">
                    <option value="">No accounts yet</option>
                  </select>
                ) : (
                  <select defaultValue="">
                    <option value="">None</option>
                    {accountsForLinking.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>

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

              {submitResult?.kind === "document" && (
                <div className="upload-sheet__result" role="status">
                  <p>
                    <strong>{submitResult.data.signalsCreated.length}</strong> signal
                    {submitResult.data.signalsCreated.length === 1 ? "" : "s"} extracted.
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
                        {submitResult.data.unmatchedAccountMentions.length === 1 ? "" : "s"} didn't match a known account
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
