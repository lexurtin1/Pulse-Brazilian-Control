import type { DashboardFreshnessDto, SourceFreshnessDto } from "@pulse-brazil/application";
import { formatDateTimeLondon } from "../../utils/formatNumbers";
import "./FreshnessIndicator.css";

interface FreshnessIndicatorProps {
  freshness: DashboardFreshnessDto | null;
}

function sourceTimestampLabel(source: SourceFreshnessDto): string {
  return source.asOf ? formatDateTimeLondon(source.asOf) : "Never run";
}

/** At-a-glance dashboard health: a colored ring for the worst-of two real sources (Salesforce pipeline upload, market research sweep), with the per-source breakdown on hover. See GetDashboardFreshness for the thresholds. */
export function FreshnessIndicator({ freshness }: FreshnessIndicatorProps) {
  if (!freshness) return null;

  return (
    <div className="freshness-indicator" tabIndex={0}>
      <span
        className={`freshness-indicator__ring freshness-indicator__ring--${freshness.overallStatus}`}
        aria-hidden="true"
      />
      <span className="freshness-indicator__label">DATA</span>
      <div className="freshness-indicator__tooltip" role="tooltip">
        <FreshnessRow source={freshness.pipeline} />
        <FreshnessRow source={freshness.marketSweep} />
      </div>
    </div>
  );
}

function FreshnessRow({ source }: { source: SourceFreshnessDto }) {
  return (
    <div className="freshness-indicator__row">
      <span className={`freshness-indicator__dot freshness-indicator__dot--${source.status}`} aria-hidden="true" />
      <span className="freshness-indicator__row-text">
        <strong>{source.label}</strong>
        <span>{sourceTimestampLabel(source)}</span>
      </span>
    </div>
  );
}
