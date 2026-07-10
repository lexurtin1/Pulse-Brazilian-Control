import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Building2, X } from "lucide-react";
import type { AccountSummaryDto } from "@pulse-brazil/application";
import { createAccount } from "../../api/client";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { formatEnumLabel } from "../../utils/formatEnumLabel";
import "./CreateAccountFAB.css";

interface CreateAccountFABProps {
  /** Called after a successful create, so the caller can refresh the account list. */
  onCreated?: () => void;
}

// Mirrors AccountType/AccountStatus (packages/domain) as literal strings —
// same convention UploadFAB already uses for ConnectorSource, keeping the UI
// decoupled from the domain layer.
const ACCOUNT_TYPES = [
  "AssetManager",
  "Bank",
  "Broker",
  "Custodian",
  "ExchangeOrVenue",
  "RegulatoryBody",
  "Corporate",
  "Other",
];
const ACCOUNT_STATUSES = ["Prospect", "Active", "Dormant", "Churned"];

const TITLE_ID = "create-account-sheet-title";

export function CreateAccountFAB({ onCreated }: CreateAccountFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<AccountSummaryDto | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  function close() {
    setIsOpen(false);
  }

  useDialogA11y(sheetRef, isOpen, close);

  function reset() {
    setSubmitError(null);
    setCreated(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Captured synchronously — React nullifies event.currentTarget once the
    // synthetic event finishes dispatching, which happens before the awaited
    // createAccount() call below resolves.
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") ?? "").trim();
    const accountType = String(form.get("accountType") ?? "");
    const status = String(form.get("status") ?? "");
    const city = String(form.get("city") ?? "").trim();

    if (!name) {
      setSubmitError("Name is required.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setCreated(null);

    try {
      const account = await createAccount({ name, accountType, status, city: city || undefined });
      setCreated(account);
      formElement.reset();
      onCreated?.();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to create account.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" className="create-account-fab" aria-label="Add account" onClick={() => setIsOpen(true)}>
        <Building2 size={22} strokeWidth={2} />
      </button>

      {isOpen && (
        <div
          className="create-account-sheet-backdrop"
          onClick={() => {
            close();
            reset();
          }}
        >
          <div
            ref={sheetRef}
            className="create-account-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={TITLE_ID}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="create-account-sheet__handle-row">
              <span className="create-account-sheet__handle" aria-hidden="true" />
              <button
                type="button"
                className="create-account-sheet__close"
                aria-label="Close"
                onClick={() => {
                  close();
                  reset();
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form className="create-account-sheet__form" onSubmit={handleSubmit}>
              <h2 id={TITLE_ID} className="create-account-sheet__title">
                Add an account
              </h2>

              <p className="create-account-sheet__hint">
                This creates the account record only. It won't appear on the map until an office location is linked to
                it — for example by re-importing a location CSV with this account's id in linked_account_id.
              </p>

              <label className="create-account-sheet__field">
                <span>Name</span>
                <input type="text" name="name" required autoComplete="off" />
              </label>

              <label className="create-account-sheet__field">
                <span>Account type</span>
                <select name="accountType" defaultValue={ACCOUNT_TYPES[0]}>
                  {ACCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {formatEnumLabel(type)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="create-account-sheet__field">
                <span>Status</span>
                <select name="status" defaultValue="Prospect">
                  {ACCOUNT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatEnumLabel(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="create-account-sheet__field">
                <span>City (optional)</span>
                <input type="text" name="city" autoComplete="off" />
              </label>

              {submitError && (
                <p className="create-account-sheet__error" role="alert">
                  {submitError}
                </p>
              )}

              {created && (
                <div className="create-account-sheet__result" role="status">
                  <p>
                    <strong>{created.name}</strong> created.
                  </p>
                </div>
              )}

              <button type="submit" className="create-account-sheet__submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating…" : "Create account"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
