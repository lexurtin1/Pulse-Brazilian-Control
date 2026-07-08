import type { AccountSummaryDto, SignalDto } from "@pulse-brazil/application";
import "./SignalFeed.css";

interface SignalFeedProps {
  signals: SignalDto[];
  accountsById: Map<string, AccountSummaryDto>;
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SignalFeed({ signals, accountsById, selectedAccountId, onSelectAccount }: SignalFeedProps) {
  const sorted = [...signals].sort(
    (a, b) => new Date(b.dateObserved).getTime() - new Date(a.dateObserved).getTime(),
  );

  return (
    <div className="signal-feed">
      <div className="signal-feed__header">
        <h1 className="signal-feed__title">Signals</h1>
      </div>
      {sorted.length === 0 ? (
        <p className="signal-feed__empty">No signals yet</p>
      ) : (
        <ul className="signal-feed__list">
          {sorted.map((signal) => {
            const accountId = signal.linkedAccountIds[0];
            const account = accountId ? accountsById.get(accountId) : undefined;
            const isSelected = accountId != null && accountId === selectedAccountId;

            return (
              <li key={signal.id}>
                <button
                  type="button"
                  className="signal-feed__item"
                  data-selected={isSelected || undefined}
                  disabled={!accountId}
                  onClick={() => accountId && onSelectAccount(accountId)}
                >
                  <div className="signal-feed__meta">
                    <span className="signal-feed__timestamp">{formatTimestamp(signal.dateObserved)}</span>
                    <span className="signal-feed__account">{account?.name ?? "Unlinked account"}</span>
                    <span className="signal-feed__type">{signal.type}</span>
                  </div>
                  <p className="signal-feed__summary">{signal.summary}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
