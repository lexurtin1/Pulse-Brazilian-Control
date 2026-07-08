import { useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { Plus, X, UploadCloud } from "lucide-react";
import type { AccountSummaryDto } from "@pulse-brazil/application";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { formatEnumLabel } from "../../utils/formatEnumLabel";
import "./UploadFAB.css";

interface UploadFABProps {
  accountsForLinking: AccountSummaryDto[];
}

const SOURCE_TYPES = ["DocumentUpload", "EmailForward", "ManualEntry", "WebResearch", "Other"];
const TITLE_ID = "upload-sheet-title";
const SOURCE_TYPE_LEGEND_ID = "upload-sheet-source-type-legend";

export function UploadFAB({ accountsForLinking }: UploadFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  function close() {
    setIsOpen(false);
  }

  useDialogA11y(sheetRef, isOpen, close);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) setFileName(file.name);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsOpen(false);
    setFileName(null);
  }

  return (
    <>
      <button type="button" className="upload-fab" aria-label="Upload document" onClick={() => setIsOpen(true)}>
        <Plus size={22} strokeWidth={2.25} />
      </button>

      {isOpen && (
        <div className="upload-sheet-backdrop" onClick={close}>
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
              <button type="button" className="upload-sheet__close" aria-label="Close" onClick={close}>
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
                <p>{fileName ?? "Drag a file here, or click to browse"}</p>
                <input
                  type="file"
                  className="upload-sheet__file-input"
                  aria-label="Choose file"
                  onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
                />
              </div>

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

              <button type="submit" className="upload-sheet__submit">
                Add to Pulse
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
