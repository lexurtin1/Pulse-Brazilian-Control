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

/** The market-sweep topics a user can filter the feed down to — matches the SignalTypes RunMarketResearchSweep produces, one chip each, plus "All". */
const FILTERABLE_TYPES: { type: string; label: string }[] = [
  { type: "CompetitiveIntelligence", label: "Competitor" },
  { type: "RegulatoryChange", label: "Regulatory" },
  { type: "CrossBorder", label: "Cross-Border" },
  { type: "Tokenisation", label: "Tokenisation" },
  { type: "ETF", label: "ETF" },
  { type: "MarketStructure", label: "Market" },
];

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function LiveFeedCard({ signals, accountsById, selectedAccountId, onSelectAccount }: LiveFeedCardProps) {
  const [now] = useState(() => new Date());
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [expandedSignalId, setExpandedSignalId] = useState<string | null>(null);

  const filteredSignals = useMemo(
    () => (activeFilter ? signals.filter((signal) => signal.type === activeFilter) : signals),
    [signals, activeFilter],
  );

  const groups = useMemo(() => {
    const sorted = [...filteredSignals].sort(
      (a, b) => new Date(b.dateObserved).getTime() - new Date(a.dateObserved).getTime(),
    );
    return groupSignalsByDay(sorted, now);
  }, [filteredSignals, now]);

  function handleItemClick(signal: SignalDto) {
    const accountId = signal.linkedAccountIds[0];
    if (accountId) {
      onSelectAccount(accountId);
    }
    setExpandedSignalId((current) => (current === signal.id ? null : signal.id));
  }

  return (
    <div className="rail-card rail-card--live-feed">
      <div className="rail-card__live-heading">
        <span className="live-dot" aria-hidden="true" />
        <span className="rail-card__label rail-card__label--accent">LIVE FEED</span>
      </div>

      <div className="live-feed__filters" role="group" aria-label="Filter live feed by signal type">
        <button
          type="button"
          className="live-feed__filter-chip"
          data-active={activeFilter === null || undefined}
          onClick={() => setActiveFilter(null)}
        >
          All
        </button>
        {FILTERABLE_TYPES.map((filter) => (
          <button
            key={filter.type}
            type="button"
            className="live-feed__filter-chip"
            data-signal-type={filter.type}
            data-active={activeFilter === filter.type || undefined}
            onClick={() => setActiveFilter((current) => (current === filter.type ? null : filter.type))}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {filteredSignals.length === 0 ? (
        <p className="rail-card__empty">
          {signals.length === 0
            ? "No feed activity yet — upload a document or run a Perplexity sweep to populate this card."
            : "No signals match this filter yet."}
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
                  const isExpanded = signal.id === expandedSignalId;
                  const bullets = signal.summary.split("\n").filter((line) => line.trim().length > 0);

                  return (
                    <li key={signal.id}>
                      <button
                        type="button"
                        className="live-feed__item"
                        data-selected={isSelected || undefined}
                        data-expanded={isExpanded || undefined}
                        aria-expanded={isExpanded}
                        onClick={() => handleItemClick(signal)}
                      >
                        <div className="live-feed__meta">
                          <span className="live-feed__timestamp">{formatTimestamp(signal.dateObserved)}</span>
                          <span className="live-feed__account">{account?.name ?? "Brazil market"}</span>
                          <span className="live-feed__type-chip" data-signal-type={signal.type}>
                            {formatEnumLabel(signal.type)}
                          </span>
                          <span className="live-feed__source-chip">{formatEnumLabel(signal.source)}</span>
                        </div>
                        <ul className="live-feed__bullets">
                          {bullets.map((bullet, index) => (
                            <li key={index}>{bullet}</li>
                          ))}
                        </ul>
                        {isExpanded && (signal.detail || signal.sources.length > 0) && (
                          <div className="live-feed__detail">
                            {signal.detail && <p className="live-feed__detail-text">{signal.detail}</p>}
                            {signal.sources.length > 0 && (
                              <ul className="live-feed__sources">
                                {signal.sources.map((source) => (
                                  <li key={source.url}>
                                    <a
                                      href={source.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      {hostname(source.url)}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
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
