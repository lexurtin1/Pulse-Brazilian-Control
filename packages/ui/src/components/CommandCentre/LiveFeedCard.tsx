import { useMemo, useState } from "react";
import type { AccountSummaryDto, SignalDto } from "@pulse-brazil/application";
import { groupSignalsByDay } from "../../utils/groupSignalsByDay";
import { formatEnumLabel } from "../../utils/formatEnumLabel";
import "./CommandCentre.css";

interface LiveFeedCardProps {
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

export function LiveFeedCard({ signals, accountsById, selectedAccountId, onSelectAccount }: LiveFeedCardProps) {
  const [now] = useState(() => new Date());

  const groups = useMemo(() => {
    const sorted = [...signals].sort(
      (a, b) => new Date(b.dateObserved).getTime() - new Date(a.dateObserved).getTime(),
    );
    return groupSignalsByDay(sorted, now);
  }, [signals, now]);

  return (
    <div className="rail-card rail-card--live-feed">
      <div className="rail-card__live-heading">
        <span className="live-dot" aria-hidden="true" />
        <span className="rail-card__label rail-card__label--accent">LIVE FEED</span>
      </div>

      {signals.length === 0 ? (
        <p className="rail-card__empty">
          No feed activity yet — upload a document or run a Perplexity sweep to populate this card.
        </p>
      ) : (
        <div className="live-feed__groups">
          {groups.map((group) => (
            <section key={group.id} className="live-feed__group" aria-labelledby={`live-feed-day-${group.id}`}>
              <h3 id={`live-feed-day-${group.id}`} className="live-feed__day-heading">
                {group.label}
              </h3>
              <ul className="live-feed__list">
                {group.signals.map((signal) => {
                  const accountId = signal.linkedAccountIds[0];
                  const account = accountId ? accountsById.get(accountId) : undefined;
                  const isSelected = accountId != null && accountId === selectedAccountId;

                  return (
                    <li key={signal.id}>
                      <button
                        type="button"
                        className="live-feed__item"
                        data-selected={isSelected || undefined}
                        disabled={!accountId}
                        onClick={() => accountId && onSelectAccount(accountId)}
                      >
                        <div className="live-feed__meta">
                          <span className="live-feed__timestamp">{formatTimestamp(signal.dateObserved)}</span>
                          <span className="live-feed__account">{account?.name ?? "Unlinked account"}</span>
                          <span className="live-feed__type-chip" data-signal-type={signal.type}>
                            {formatEnumLabel(signal.type)}
                          </span>
                          <span className="live-feed__source-chip">{formatEnumLabel(signal.source)}</span>
                        </div>
                        <p className="live-feed__summary">{signal.summary}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
