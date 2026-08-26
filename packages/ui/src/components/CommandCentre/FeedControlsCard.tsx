import { UploadFAB } from "../UploadFAB/UploadFAB";
import { PerplexitySweepButton } from "../PerplexitySweepButton/PerplexitySweepButton";
import { ClearFeedButton } from "../ClearFeedButton/ClearFeedButton";
import "./CommandCentre.css";
import "./FeedControlsCard.css";

interface FeedControlsCardProps {
  onImported: () => void;
  onSweepComplete: () => void;
  onFeedCleared: () => void;
}

export function FeedControlsCard({ onImported, onSweepComplete, onFeedCleared }: FeedControlsCardProps) {
  return (
    <div className="kpi-card">
      <span className="kpi-card__label rail-card__label--accent">FEED CONTROLS</span>
      <div className="feed-controls__actions">
        <UploadFAB onImported={onImported} variant="inline" />
        <PerplexitySweepButton onComplete={onSweepComplete} variant="inline" />
        <ClearFeedButton onCleared={onFeedCleared} />
      </div>
      <span className="kpi-card__footnote">ACTION → any document / manual search → refresh live feed</span>
    </div>
  );
}
