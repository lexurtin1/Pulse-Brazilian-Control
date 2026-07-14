import type { AccountSummaryDto } from "@pulse-brazil/application";
import { UploadFAB } from "../UploadFAB/UploadFAB";
import { PerplexitySweepButton } from "../PerplexitySweepButton/PerplexitySweepButton";
import { ClearFeedButton } from "../ClearFeedButton/ClearFeedButton";
import "./CommandCentre.css";
import "./FeedControlsCard.css";

interface FeedControlsCardProps {
  accountsForLinking: AccountSummaryDto[];
  onImported: () => void;
  onSweepComplete: () => void;
  onFeedCleared: () => void;
}

export function FeedControlsCard({ accountsForLinking, onImported, onSweepComplete, onFeedCleared }: FeedControlsCardProps) {
  return (
    <div className="kpi-card">
      <span className="kpi-card__label rail-card__label--accent">FEED CONTROLS</span>
      <div className="feed-controls__actions">
        <UploadFAB accountsForLinking={accountsForLinking} onImported={onImported} variant="inline" />
        <PerplexitySweepButton onComplete={onSweepComplete} variant="inline" />
        <ClearFeedButton onCleared={onFeedCleared} />
      </div>
      <span className="kpi-card__footnote">ACTION → doc upload / manual search → refresh live feed</span>
    </div>
  );
}
