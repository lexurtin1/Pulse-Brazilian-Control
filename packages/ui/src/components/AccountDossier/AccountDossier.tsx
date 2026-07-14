import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { AccountDetailDto } from "@pulse-brazil/application";
import { fetchAccountDetail } from "../../api/client";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { formatEnumLabel } from "../../utils/formatEnumLabel";
import { clientTypeColorVar, clientTypeLabel, primaryClientType } from "../../utils/clientType";
import { InformationSweepSection } from "../InformationSweepSection/InformationSweepSection";
import "./AccountDossier.css";

interface AccountDossierProps {
  accountId: string | null;
  onClose: () => void;
}

type DossierState = { status: "loading" } | { status: "error" } | { status: "ready"; detail: AccountDetailDto };

const TITLE_ID = "account-dossier-title";

export function AccountDossier({ accountId, onClose }: AccountDossierProps) {
  const [state, setState] = useState<DossierState>({ status: "loading" });
  const containerRef = useRef<HTMLDivElement>(null);

  useDialogA11y(containerRef, accountId != null, onClose);

  useEffect(() => {
    if (!accountId) return;

    let cancelled = false;
    setState({ status: "loading" });

    fetchAccountDetail(accountId)
      .then((result) => {
        if (cancelled) return;
        setState({ status: "ready", detail: result });
      })
      .catch((error) => {
        console.error("Failed to load account detail", error);
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (!accountId) return null;

  return (
    <div className="account-dossier-backdrop" onClick={onClose}>
      <div
        ref={containerRef}
        className="account-dossier"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="account-dossier__close" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>

        {state.status === "loading" && <p className="account-dossier__status">Loading…</p>}
        {state.status === "error" && <p className="account-dossier__status">Couldn't load this account.</p>}

        {state.status === "ready" && (
          <div className="account-dossier__content">
            <p className="account-dossier__eyebrow">{state.detail.type}</p>
            <h2 id={TITLE_ID} className="account-dossier__title">
              {state.detail.name}
            </h2>
            <div className="account-dossier__meta">
              <span className="account-dossier__status-chip">{state.detail.status}</span>
              <span className="account-dossier__client-type">
                <span
                  className="account-dossier__client-type-dot"
                  style={{ background: `var(${clientTypeColorVar(primaryClientType(state.detail.clientTypes))})` }}
                  aria-hidden="true"
                />
                {clientTypeLabel(primaryClientType(state.detail.clientTypes))}
              </span>
              {state.detail.primaryLocation.city && (
                <span className="account-dossier__location">{state.detail.primaryLocation.city}</span>
              )}
            </div>

            <InformationSweepSection
              accountId={state.detail.id}
              brief={state.detail.researchBrief}
              onSweepComplete={(researchBrief) =>
                setState((prev) => (prev.status === "ready" ? { ...prev, detail: { ...prev.detail, researchBrief } } : prev))
              }
            />

            {state.detail.latestInsight && (
              <section className="account-dossier__section">
                <h3>Latest insight</h3>
                <p>{state.detail.latestInsight.summary}</p>
                {state.detail.latestInsight.recommendedActions.map((action, index) => (
                  <p key={`${state.detail.id}-action-${index}`} className="account-dossier__action">
                    → {action.description}
                  </p>
                ))}
              </section>
            )}

            <section className="account-dossier__section">
              <h3>Office locations</h3>
              {state.detail.officeLocations.length === 0 && (
                <p className="account-dossier__empty">None on file.</p>
              )}
              <ul className="account-dossier__list">
                {state.detail.officeLocations.map((office) => (
                  <li key={office.id}>
                    {office.normalizedAddress ?? office.rawAddress}
                    {office.isPrimary && <span className="account-dossier__badge">Primary</span>}
                  </li>
                ))}
              </ul>
            </section>

            <section className="account-dossier__section">
              <h3>External references</h3>
              {state.detail.externalReferences.length === 0 && (
                <p className="account-dossier__empty">None on file.</p>
              )}
              <ul className="account-dossier__list">
                {state.detail.externalReferences.map((reference) => (
                  <li key={reference.system}>
                    {reference.system}: {reference.externalId}
                  </li>
                ))}
              </ul>
            </section>

            <section className="account-dossier__section">
              <h3>Recent signals</h3>
              {state.detail.recentSignals.length === 0 && (
                <p className="account-dossier__empty">No recent signals.</p>
              )}
              <ul className="account-dossier__list account-dossier__list--signals">
                {state.detail.recentSignals.map((signal) => (
                  <li key={signal.id}>
                    <span className="account-dossier__signal-type">{signal.type}</span>
                    <span className="account-dossier__signal-source">{formatEnumLabel(signal.source)}</span>
                    <p>{signal.summary}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
