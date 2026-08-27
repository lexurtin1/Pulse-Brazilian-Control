import type { DashboardFreshnessDto } from "@pulse-brazil/application";
import { useTheme } from "../../hooks/useTheme";
import { useClock } from "../../hooks/useClock";
import { PulseLogo } from "../PulseLogo/PulseLogo";
import { UploadFAB } from "../UploadFAB/UploadFAB";
import { PerplexitySweepButton } from "../PerplexitySweepButton/PerplexitySweepButton";
import { ClearFeedButton } from "../ClearFeedButton/ClearFeedButton";
import { FreshnessIndicator } from "./FreshnessIndicator";
import "./FeedActions.css";
import "./CommandHeader.css";

interface CommandHeaderProps {
  freshness: DashboardFreshnessDto | null;
  /** Upload / sweep / clear-feed used to be a KPI tile of their own. They are controls, not figures, so they sit in the header and the strip's space goes to the map and the rail. */
  onImported: () => void;
  onSweepComplete: () => void;
  onFeedCleared: () => void;
}

export function CommandHeader({ freshness, onImported, onSweepComplete, onFeedCleared }: CommandHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { brt, london } = useClock();

  return (
    <header className="command-header">
      <div className="command-header__left">
        <PulseLogo inline />
        <span className="command-header__divider" aria-hidden="true" />
        <span className="command-header__title">BRAZIL INTELLIGENCE</span>
        <span className="command-header__live-badge">
          <span className="live-dot" aria-hidden="true" />
          LIVE
        </span>
      </div>
      <div className="command-header__right">
        <div className="feed-actions">
          <UploadFAB onImported={onImported} variant="inline" />
          <PerplexitySweepButton onComplete={onSweepComplete} variant="inline" />
          <ClearFeedButton onCleared={onFeedCleared} />
        </div>
        <span className="command-header__divider" aria-hidden="true" />
        <FreshnessIndicator freshness={freshness} />
        <span className="command-header__clock">{brt} BRT</span>
        <span className="command-header__clock">{london} LONDON</span>
        <span className="command-header__user">ALEX CURTIN</span>
        <button
          type="button"
          className="command-header__theme-toggle"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={toggleTheme}
        >
          {theme === "dark" ? "☀ LIGHT" : "☾ DARK"}
        </button>
      </div>
    </header>
  );
}
