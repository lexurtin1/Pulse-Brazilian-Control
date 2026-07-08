import { useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { Plus, X, UploadCloud } from "lucide-react";
import type { AccountSummaryDto } from "@pulse-brazil/application";
import "./UploadFAB.css";

interface UploadFABProps {
  accountsForLinking: AccountSummaryDto[];
}

const SOURCE_TYPES = ["DocumentUpload", "EmailForward", "ManualEntry", "WebResearch", "Other"];

export function UploadFAB({ accountsForLinking }: UploadFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

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
      <button
        type="button"
        className="upload-fab"
        aria-label="Upload document"
        onClick={() => setIsOpen(true)}
      >
        <Plus size={22} strokeWidth={2.25} />
      </button>

      {isOpen && (
        <div className="upload-sheet-backdrop" onClick={() => setIsOpen(false)}>
          <div className="upload-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="upload-sheet__handle-row">
              <span className="upload-sheet__handle" aria-hidden="true" />
              <button
                type="button"
                className="upload-sheet__close"
                aria-label="Close"
                onClick={() => setIsOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form className="upload-sheet__form" onSubmit={handleSubmit}>
              <h2 className="upload-sheet__title">Upload Document</h2>

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

              <label className="upload-sheet__field">
                <span>Source type</span>
                <select defaultValue={SOURCE_TYPES[0]}>
                  {SOURCE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="upload-sheet__field">
                <span>Link to account (optional)</span>
                <select defaultValue="">
                  <option value="">None</option>
                  {accountsForLinking.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>

              <button type="submit" className="upload-sheet__submit">
                Submit
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
