import { useMemo, useState } from "react";
import type { AccountSummaryDto, OpenDealsResultDto } from "@pulse-brazil/application";
import { formatCount, formatCurrency } from "../../utils/formatNumbers";
import { clientTypeColorVar, primaryClientType } from "../../utils/clientType";
import "./CommandCentre.css";

interface OpenDealsCardProps {
  openDeals: OpenDealsResultDto | null;
  accountsById: Map<string, AccountSummaryDto>;
}

export function OpenDealsCard({ openDeals, accountsById }: OpenDealsCardProps) {
  const [query, setQuery] = useState("");

  // Every open deal is listed now, not a top 3 — on a full pipeline that is a
  // long scroll, so a filter is the difference between "all the deals are
  // here" and "the deal I want is in here somewhere".
  const visibleDeals = useMemo(() => {
    if (!openDeals) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return openDeals.deals;
    return openDeals.deals.filter(
      (deal) =>
        deal.accountNameRaw.toLowerCase().includes(needle) ||
        deal.opportunityName.toLowerCase().includes(needle) ||
        deal.stage.toLowerCase().includes(needle),
    );
  }, [openDeals, query]);

  if (!openDeals || openDeals.deals.length === 0) {
    return (
      <div className="rail-card rail-card--open-deals">
        <span className="rail-card__label">PIPELINE · OPEN DEALS</span>
        <p className="rail-card__empty">
          {openDeals
            ? "No open deals in the latest pipeline upload."
            : "No pipeline data yet — upload a Salesforce pipeline export to populate this card."}
        </p>
      </div>
    );
  }

  return (
    <div className="rail-card rail-card--open-deals">
      <div className="open-deals__header">
        <span className="rail-card__label">PIPELINE · OPEN DEALS</span>
        <span className="open-deals__total">
          {formatCount(openDeals.dealCount)} · {formatCurrency(openDeals.totalValue)}
        </span>
      </div>

      <input
        type="search"
        className="open-deals__filter"
        placeholder="Filter by account, opportunity, or stage"
        aria-label="Filter open deals"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {visibleDeals.length === 0 ? (
        <p className="rail-card__empty">No open deals match “{query.trim()}”.</p>
      ) : (
        <ul className="open-deals__list">
          {visibleDeals.map((deal) => {
            const account = deal.linkedAccountId ? accountsById.get(deal.linkedAccountId) : undefined;
            return (
              <li key={deal.id} className="open-deals__row">
                <div className="open-deals__row-main">
                  <span className="open-deals__account">
                    {account && (
                      <span
                        className="open-deals__client-type-dot"
                        style={{ background: `var(${clientTypeColorVar(primaryClientType(account.clientTypes))})` }}
                        aria-hidden="true"
                      />
                    )}
                    {deal.accountNameRaw}
                  </span>
                  <span className="open-deals__amount">{formatCurrency(deal.amount)}</span>
                </div>
                <div className="open-deals__row-meta">
                  <span className="open-deals__opportunity" title={deal.opportunityName}>
                    {deal.opportunityName}
                  </span>
                  <span className="open-deals__stage" data-stage={deal.stage}>
                    {deal.stage}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
