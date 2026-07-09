import { useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { Plus, X, UploadCloud } from "lucide-react";
import type { AccountSummaryDto, ImportLocationCsvResultDto } from "@pulse-brazil/application";
import { importLocationCsv } from "../../api/client";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { formatEnumLabel } from "../../utils/formatEnumLabel";
import "./UploadFAB.css";

interface UploadFABProps {
  accountsForLinking: AccountSummaryDto[];
  /** Called after a CSV import completes successfully, so the caller can refresh map pins. */
  onImported?: () => void;
}

const SOURCE_TYPES = ["DocumentUpload", "EmailForward", "ManualEntry", "WebResearch", "Other"];
const TITLE_ID = "upload-sheet-title";
const SOURCE_TYPE_LEGEND_ID = "upload-sheet-source-type-legend";

export function UploadFAB({ accountsForLinking, onImported }: UploadFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<ImportLocationCsvResultDto | null>(null);
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!file) {
      setSubmitError("Choose a file first.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      // Location CSV import is the only ingestion path actually wired to a
      // backend today — say so plainly rather than pretending the sheet
      // accepts any file type.
      setSubmitError("Only CSV location files can be uploaded right now.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitResult(null);

    try {
      const csvText = await file.text();
      const result = await importLocationCsv({ csvText, originalFilename: file.name });
      setSubmitResult(result);
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
      <button type="button" className="upload-fab" aria-label="Upload document" onClick={() => setIsOpen(true)}>
        <Plus size={22} strokeWidth={2.25} />
      </button>

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
                  accept=".csv,text/csv"
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
                  Detected as a Brazil location CSV — imported directly. Source type and account link below aren't used for
                  this format; each row declares its own kind and (optionally) its own linked account.
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

              {submitResult && (
                <div className="upload-sheet__result" role="status">
                  <p>
                    <strong>{submitResult.acceptedRows}</strong> of {submitResult.totalRows} row
                    {submitResult.totalRows === 1 ? "" : "s"} imported.
                  </p>
                  {submitResult.reviewRequiredCount > 0 && (
                    <p>{submitResult.reviewRequiredCount} record(s) flagged for review.</p>
                  )}
                  {submitResult.rejectedRows.length > 0 && (
                    <details>
                      <summary>
                        {submitResult.rejectedRows.length} row{submitResult.rejectedRows.length === 1 ? "" : "s"} rejected
                      </summary>
                      <ul className="upload-sheet__result-errors">
                        {submitResult.rejectedRows.map((row) => (
                          <li key={row.rowNumber}>
                            Row {row.rowNumber}: {row.errors.join("; ")}
                          </li>
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
