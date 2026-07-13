import type { TopOpenDealsResultDto } from "@pulse-brazil/application";
import { formatCurrency } from "../../utils/formatNumbers";
import "./CommandCentre.css";

interface TopOpenDealsCardProps {
  topOpenDeals: TopOpenDealsResultDto | null;
}

export function TopOpenDealsCard({ topOpenDeals }: TopOpenDealsCardProps) {
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
        {topOpenDeals.deals.map((deal) => (
          <li key={deal.id} className="top-open-deals__row">
            <div className="top-open-deals__row-main">
              <span className="top-open-deals__account">{deal.accountNameRaw}</span>
              <span className="top-open-deals__amount">{formatCurrency(deal.amount)}</span>
            </div>
            <div className="top-open-deals__row-meta">
              <span className="top-open-deals__opportunity">{deal.opportunityName}</span>
              <span className="top-open-deals__stage">{deal.stage}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
