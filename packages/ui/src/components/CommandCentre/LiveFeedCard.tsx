import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { AccountSummaryDto, SignalDto } from "@pulse-brazil/application";
import { groupSignalsByDay } from "../../utils/groupSignalsByDay";
import { formatEnumLabel } from "../../utils/formatEnumLabel";
import { clientTypeColorVar, primaryClientType } from "../../utils/clientType";
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

  // Looked up from the full, unfiltered list so an expanded pill stays open even if the active filter would otherwise hide it.
  const expandedSignal = expandedSignalId ? (signals.find((signal) => signal.id === expandedSignalId) ?? null) : null;

  function handlePillClick(signal: SignalDto) {
    const accountId = signal.linkedAccountIds[0];
    if (accountId) {
      onSelectAccount(accountId);
    }
    setExpandedSignalId(signal.id);
  }

  if (expandedSignal) {
    const accountId = expandedSignal.linkedAccountIds[0];
    const account = accountId ? accountsById.get(accountId) : undefined;
    const bullets = expandedSignal.summary.split("\n").filter((line) => line.trim().length > 0);

    return (
      <div className="rail-card rail-card--live-feed">
        <div className="rail-card__live-heading">
          <span className="live-dot" aria-hidden="true" />
          <span className="rail-card__label rail-card__label--accent">LIVE FEED</span>
        </div>

        <div className="live-feed__takeover">
          <button type="button" className="live-feed__back" onClick={() => setExpandedSignalId(null)}>
            <ArrowLeft size={14} strokeWidth={2.5} />
            Back
          </button>

          <div className="live-feed__takeover-meta">
            <span className="live-feed__timestamp">{formatTimestamp(expandedSignal.dateObserved)}</span>
            <span className="live-feed__type-chip" data-signal-type={expandedSignal.type}>
              {formatEnumLabel(expandedSignal.type)}
            </span>
            <span className="live-feed__source-chip">{formatEnumLabel(expandedSignal.source)}</span>
          </div>

          <h3 className="live-feed__takeover-title">{expandedSignal.title}</h3>

          {account && (
            <div className="live-feed__account">
              <span
                className="live-feed__client-type-dot"
                style={{ background: `var(${clientTypeColorVar(primaryClientType(account.clientTypes))})` }}
                aria-hidden="true"
              />
              {account.name}
            </div>
          )}

          <ul className="live-feed__bullets">
            {bullets.map((bullet, index) => (
              <li key={index}>{bullet}</li>
            ))}
          </ul>

          {expandedSignal.detail && <p className="live-feed__detail-text">{expandedSignal.detail}</p>}

          {expandedSignal.sources.length > 0 && (
            <ul className="live-feed__sources">
              {expandedSignal.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {hostname(source.url)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
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
                  const isSelected = accountId != null && accountId === selectedAccountId;

                  return (
                    <li key={signal.id}>
                      <button
                        type="button"
                        className="live-feed__pill"
                        data-signal-type={signal.type}
                        data-selected={isSelected || undefined}
                        onClick={() => handlePillClick(signal)}
                      >
                        <div className="live-feed__pill-meta">
                          <span className="live-feed__timestamp">{formatTimestamp(signal.dateObserved)}</span>
                          <span className="live-feed__source-chip">{formatEnumLabel(signal.source)}</span>
                        </div>
                        <div className="live-feed__pill-heading">
                          <span className="live-feed__pill-title">{signal.title}</span>
                          <span className="live-feed__type-chip" data-signal-type={signal.type}>
                            {formatEnumLabel(signal.type)}
                          </span>
                        </div>
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
