import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { AccountResearchBriefDto } from "@pulse-brazil/application";
import { runAccountResearchSweep } from "../../api/client";
import { formatShortDate } from "../../utils/formatNumbers";
import "./InformationSweepSection.css";

interface InformationSweepSectionProps {
  accountId: string;
  brief?: AccountResearchBriefDto;
  onSweepComplete: (brief: AccountResearchBriefDto) => void;
}

/**
 * Company History / Competitive Intel — a real, account-scoped Perplexity
 * call, persisted so it's still there next time this account is opened.
 * Re-running always replaces the prior brief in full, never appends. No
 * citations shown (per the operator's explicit request), and an empty
 * section just renders no bullets rather than a "nothing found" message.
 */
export function InformationSweepSection({ accountId, brief, onSweepComplete }: InformationSweepSectionProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsRunning(true);
    setError(null);

    try {
      const result = await runAccountResearchSweep(accountId);
      onSweepComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Information sweep failed.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="account-dossier__section information-sweep">
      <div className="information-sweep__header">
        <h3>Company research</h3>
        <button type="button" className="information-sweep__button" disabled={isRunning} onClick={handleClick}>
          {isRunning ? <Loader2 size={14} strokeWidth={2} className="information-sweep__spin" /> : <Search size={14} strokeWidth={2} />}
          <span>Information Sweep</span>
        </button>
      </div>

      {brief && <p className="information-sweep__timestamp">Last swept: {formatShortDate(brief.retrievedAt)}</p>}

      {error && (
        <p className="information-sweep__error" role="alert">
          {error}
        </p>
      )}

      {brief && !error && (
        <div className="information-sweep__results">
          <div className="information-sweep__block">
            <h4>Company History</h4>
            {brief.history.length > 0 && (
              <ul className="account-dossier__list">
                {brief.history.map((line, index) => (
                  <li key={`history-${index}`}>{line}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="information-sweep__block">
            <h4>Competitive Intel</h4>
            {brief.competitiveIntel.length > 0 && (
              <ul className="account-dossier__list">
                {brief.competitiveIntel.map((line, index) => (
                  <li key={`competitive-${index}`}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
