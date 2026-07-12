import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import gsap from "gsap";
import type { AccountSummaryDto, SignalDto } from "@pulse-brazil/application";
import { groupSignalsByDay } from "../../utils/groupSignalsByDay";
import { formatEnumLabel } from "../../utils/formatEnumLabel";
import { categorizeSignal, SIGNAL_CATEGORIES, SIGNAL_CATEGORY_LABEL } from "../../utils/categorizeSignal";
import type { SignalCategory } from "../../utils/categorizeSignal";
import "./SignalFeed.css";

type CategoryFilter = "All" | SignalCategory;
const FILTER_OPTIONS: readonly CategoryFilter[] = ["All", ...SIGNAL_CATEGORIES];

interface SignalFeedProps {
  signals: SignalDto[];
  accountsById: Map<string, AccountSummaryDto>;
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
}

const PANEL_ID = "signal-feed-panel";
const TEMPERATURE_BANDS = ["Hot", "Warm", "Cool", "Cold"] as const;
const EXPANDED_WIDTH = 420;
const COLLAPSED_WIDTH = 56;

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
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>("All");
  const rootRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  // Width is gsap-driven rather than a CSS transition so it shares one
  // animation mechanism with the rest of the redesign (stat counters, in
  // particular) instead of splitting collapse behavior across CSS and JS.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!rootRef.current) return;
    gsap.to(rootRef.current, {
      width: isCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
      duration: 0.18,
      ease: "power2.inOut",
    });
  }, [isCollapsed]);

  const sorted = [...signals].sort(
    (a, b) => new Date(b.dateObserved).getTime() - new Date(a.dateObserved).getTime(),
  );
  const filtered =
    activeFilter === "All" ? sorted : sorted.filter((signal) => categorizeSignal(signal) === activeFilter);
  const groups = groupSignalsByDay(filtered, now);

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
    <div ref={rootRef} className="signal-feed" data-collapsed={isCollapsed || undefined}>
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
        <span className="signal-feed__rail-label" aria-hidden="true">
          Live Feed
        </span>
      </div>

      <div className="signal-feed__panel" id={PANEL_ID} hidden={isCollapsed}>
        <div className="signal-feed__header">
          <h1 className="signal-feed__title">Signals</h1>
          <p className="signal-feed__date">{todayLabel}</p>
        </div>

        <div className="signal-feed__filters" role="group" aria-label="Filter signals by category">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className="signal-feed__filter-pill"
              data-active={activeFilter === option || undefined}
              onClick={() => setActiveFilter(option)}
            >
              {option === "All" ? "All" : SIGNAL_CATEGORY_LABEL[option]}
            </button>
          ))}
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

        {filtered.length === 0 ? (
          <p className="signal-feed__empty">
            {activeFilter === "All" ? "No signals yet" : `No ${SIGNAL_CATEGORY_LABEL[activeFilter]} signals`}
          </p>
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
                    const category = categorizeSignal(signal);

                    return (
                      <li key={signal.id}>
                        <div className="signal-feed__item" data-selected={isSelected || undefined}>
                          <div className="signal-feed__row-top">
                            <span
                              className="signal-feed__category-dot"
                              data-category={category}
                              aria-hidden="true"
                            />
                            <span className="signal-feed__headline">
                              <span className="signal-feed__account">{account?.name ?? "Unlinked account"}</span>
                              {" — "}
                              {signal.title}
                            </span>
                            <span className="signal-feed__timestamp">{formatTimestamp(signal.dateObserved)}</span>
                          </div>
                          <p className="signal-feed__summary">{signal.summary}</p>
                          <div className="signal-feed__row-bottom">
                            <span className="signal-feed__category-chip" data-category={category}>
                              {SIGNAL_CATEGORY_LABEL[category]}
                            </span>
                            <span className="signal-feed__source-chip">{formatEnumLabel(signal.source)}</span>
                            {band && (
                              <span className="signal-feed__temp-indicator" data-band={band} aria-hidden="true" />
                            )}
                            <button
                              type="button"
                              className="signal-feed__details"
                              disabled={!accountId}
                              aria-label={`View details for ${account?.name ?? "unlinked account"}`}
                              onClick={() => accountId && onSelectAccount(accountId)}
                            >
                              Details ▾
                            </button>
                          </div>
                        </div>
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
