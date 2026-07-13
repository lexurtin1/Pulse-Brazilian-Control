import { useTheme } from "../../hooks/useTheme";
import { useClock } from "../../hooks/useClock";
import { PulseLogo } from "../PulseLogo/PulseLogo";
import "./CommandHeader.css";

export function CommandHeader() {
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
