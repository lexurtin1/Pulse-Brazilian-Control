import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { AccountDetailDto } from "@pulse-brazil/application";
import { fetchAccountDetail } from "../../api/client";
import "./AccountDossier.css";

interface AccountDossierProps {
  accountId: string | null;
  onClose: () => void;
}

type LoadState = "loading" | "error" | "ready";

export function AccountDossier({ accountId, onClose }: AccountDossierProps) {
  const [detail, setDetail] = useState<AccountDetailDto | null>(null);
  const [status, setStatus] = useState<LoadState>("loading");

  useEffect(() => {
    if (!accountId) return;

    let cancelled = false;
    setStatus("loading");
    setDetail(null);

    fetchAccountDetail(accountId)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
        setStatus("ready");
      })
      .catch((error) => {
        console.error("Failed to load account detail", error);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (!accountId) return null;

  return (
    <div className="account-dossier-backdrop" onClick={onClose}>
      <div className="account-dossier" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="account-dossier__close" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>

        {status === "loading" && <p className="account-dossier__status">Loading…</p>}
        {status === "error" && <p className="account-dossier__status">Couldn't load this account.</p>}

        {status === "ready" && detail && (
          <div className="account-dossier__content">
            <p className="account-dossier__eyebrow">{detail.type}</p>
            <h2 className="account-dossier__title">{detail.name}</h2>
            <div className="account-dossier__meta">
              <span>{detail.status}</span>
              {detail.temperatureBand && <span>{detail.temperatureBand}</span>}
              {detail.primaryLocation.city && <span>{detail.primaryLocation.city}</span>}
            </div>

            {detail.latestInsight && (
              <section className="account-dossier__section">
                <h3>Latest insight</h3>
                <p>{detail.latestInsight.summary}</p>
                {detail.latestInsight.recommendedActions.map((action, index) => (
                  <p key={`${detail.id}-action-${index}`} className="account-dossier__action">
                    → {action.description}
                  </p>
                ))}
              </section>
            )}

            <section className="account-dossier__section">
              <h3>Office locations</h3>
              {detail.officeLocations.length === 0 && <p className="account-dossier__empty">None on file.</p>}
              <ul className="account-dossier__list">
                {detail.officeLocations.map((office) => (
                  <li key={office.id}>
                    {office.normalizedAddress ?? office.rawAddress}
                    {office.isPrimary && <span className="account-dossier__badge">Primary</span>}
                  </li>
                ))}
              </ul>
            </section>

            <section className="account-dossier__section">
              <h3>External references</h3>
              {detail.externalReferences.length === 0 && <p className="account-dossier__empty">None on file.</p>}
              <ul className="account-dossier__list">
                {detail.externalReferences.map((reference) => (
                  <li key={reference.system}>
                    {reference.system}: {reference.externalId}
                  </li>
                ))}
              </ul>
            </section>

            <section className="account-dossier__section">
              <h3>Recent signals</h3>
              {detail.recentSignals.length === 0 && <p className="account-dossier__empty">No recent signals.</p>}
              <ul className="account-dossier__list account-dossier__list--signals">
                {detail.recentSignals.map((signal) => (
                  <li key={signal.id}>
                    <span className="account-dossier__signal-type">{signal.type}</span>
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
