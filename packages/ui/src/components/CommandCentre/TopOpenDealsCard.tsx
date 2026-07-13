import type { AccountSummaryDto, TopOpenDealsResultDto } from "@pulse-brazil/application";
import { formatCurrency } from "../../utils/formatNumbers";
import { clientTypeColorVar, primaryClientType } from "../../utils/clientType";
import "./CommandCentre.css";

interface TopOpenDealsCardProps {
  topOpenDeals: TopOpenDealsResultDto | null;
  accountsById: Map<string, AccountSummaryDto>;
}

export function TopOpenDealsCard({ topOpenDeals, accountsById }: TopOpenDealsCardProps) {
  if (!topOpenDeals || topOpenDeals.deals.length === 0) {
    return (
      <div className="rail-card">
        <span className="rail-card__label">PIPELINE · TOP OPEN DEALS</span>
        <p className="rail-card__empty">
          {topOpenDeals
            ? "No open deals in the latest pipeline upload."
            : "No pipeline data yet — upload a Salesforce pipeline export to populate this card."}
        </p>
      </div>
    );
  }

  return (
    <div className="rail-card">
      <span className="rail-card__label">PIPELINE · TOP OPEN DEALS</span>
      <ul className="top-open-deals__list">
        {topOpenDeals.deals.map((deal) => {
          const account = deal.linkedAccountId ? accountsById.get(deal.linkedAccountId) : undefined;
          return (
            <li key={deal.id} className="top-open-deals__row">
              <div className="top-open-deals__row-main">
                <span className="top-open-deals__account">
                  {account && (
                    <span
                      className="top-open-deals__client-type-dot"
                      style={{ background: `var(${clientTypeColorVar(primaryClientType(account.clientTypes))})` }}
                      aria-hidden="true"
                    />
                  )}
                  {deal.accountNameRaw}
                </span>
                <span className="top-open-deals__amount">{formatCurrency(deal.amount)}</span>
              </div>
              <div className="top-open-deals__row-meta">
                <span className="top-open-deals__opportunity">{deal.opportunityName}</span>
                <span className="top-open-deals__stage">{deal.stage}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
