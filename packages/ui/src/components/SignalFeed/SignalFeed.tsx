import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AccountSummaryDto, SignalDto } from "@pulse-brazil/application";
import { groupSignalsByDay } from "../../utils/groupSignalsByDay";
import { formatEnumLabel } from "../../utils/formatEnumLabel";
import "./SignalFeed.css";

interface SignalFeedProps {
  signals: SignalDto[];
  accountsById: Map<string, AccountSummaryDto>;
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
}

const PANEL_ID = "signal-feed-panel";
const TEMPERATURE_BANDS = ["Hot", "Warm", "Cool", "Cold"] as const;

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SignalFeed({ signals, accountsById, selectedAccountId, onSelectAccount }: SignalFeedProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [now] = useState(() => new Date());

  const sorted = [...signals].sort(
    (a, b) => new Date(b.dateObserved).getTime() - new Date(a.dateObserved).getTime(),
  );
  const groups = groupSignalsByDay(sorted, now);

  const temperatureCounts = useMemo(() => {
    const counts: Record<(typeof TEMPERATURE_BANDS)[number], number> = { Hot: 0, Warm: 0, Cool: 0, Cold: 0 };
    for (const account of accountsById.values()) {
      if (account.temperatureBand && account.temperatureBand in counts) {
        counts[account.temperatureBand as (typeof TEMPERATURE_BANDS)[number]] += 1;
      }
    }
    return counts;
  }, [accountsById]);

  const totalWithTemperature = TEMPERATURE_BANDS.reduce((sum, band) => sum + temperatureCounts[band], 0);

  const todayLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="signal-feed" data-collapsed={isCollapsed || undefined}>
      <div className="signal-feed__rail">
        <button
          type="button"
          className="signal-feed__toggle"
          aria-expanded={!isCollapsed}
          aria-controls={PANEL_ID}
          aria-label={isCollapsed ? "Expand signal feed" : "Collapse signal feed"}
          onClick={() => setIsCollapsed((prev) => !prev)}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="signal-feed__panel" id={PANEL_ID} hidden={isCollapsed}>
        <div className="signal-feed__header">
          <h1 className="signal-feed__title">Signals</h1>
          <p className="signal-feed__date">{todayLabel}</p>
        </div>

        {totalWithTemperature > 0 && (
          <div className="signal-feed__temp-summary">
            <div className="signal-feed__temp-strip" role="group" aria-label="Account temperature summary">
              {TEMPERATURE_BANDS.map((band) => (
                <div key={band} className="signal-feed__temp-count">
                  <span className="signal-feed__temp-dot" data-band={band} aria-hidden="true" />
                  <span>
                    {temperatureCounts[band]} {band}
                  </span>
                </div>
              ))}
            </div>
            <div className="signal-feed__temp-bar" aria-hidden="true">
              {TEMPERATURE_BANDS.map((band) => {
                const count = temperatureCounts[band];
                if (count === 0) return null;
                return (
                  <span
                    key={band}
                    className="signal-feed__temp-bar-segment"
                    data-band={band}
                    // Width is a continuous computed proportion, not a themeable
                    // color — the one legitimate case for an inline style here.
                    style={{ width: `${(count / totalWithTemperature) * 100}%` }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {sorted.length === 0 ? (
          <p className="signal-feed__empty">No signals yet</p>
        ) : (
          <div className="signal-feed__groups">
            {groups.map((group) => (
              <section key={group.id} className="signal-feed__group" aria-labelledby={`signal-day-${group.id}`}>
                <h3 id={`signal-day-${group.id}`} className="signal-feed__day-heading">
                  {group.label}
                </h3>
                <ul className="signal-feed__list">
                  {group.signals.map((signal) => {
                    const accountId = signal.linkedAccountIds[0];
                    const account = accountId ? accountsById.get(accountId) : undefined;
                    const isSelected = accountId != null && accountId === selectedAccountId;
                    const band = account?.temperatureBand;

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
                            {band && (
                              <span className="signal-feed__temp-indicator" data-band={band} aria-hidden="true" />
                            )}
                            <span className="signal-feed__timestamp">{formatTimestamp(signal.dateObserved)}</span>
                            <span className="signal-feed__account">{account?.name ?? "Unlinked account"}</span>
                            <span className="signal-feed__type-chip" data-signal-type={signal.type}>
                              {formatEnumLabel(signal.type)}
                            </span>
                            <span className="signal-feed__source-chip">{formatEnumLabel(signal.source)}</span>
                          </div>
                          <p className="signal-feed__summary">{signal.summary}</p>
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
    </div>
  );
}
