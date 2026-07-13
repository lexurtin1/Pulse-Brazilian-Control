import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { RunMarketResearchSweepResult } from "@pulse-brazil/application";
import { runResearchSweep } from "../../api/client";
import "./PerplexitySweepButton.css";

interface PerplexitySweepButtonProps {
  /** Called after a completed sweep (even with per-topic errors), so the caller can refresh the signal feed. */
  onComplete?: () => void;
  /** "fab" (default): floating circular trigger + fixed popover. "inline": flows as a normal button, for the Command Centre's Feed Controls card. */
  variant?: "fab" | "inline";
}

/**
 * Manually fires the same GET /api/signals/research-sweep endpoint Vercel
 * Cron hits on schedule — real Perplexity calls, real spend, no confirmation
 * step (per the operator's explicit request for a one-press manual trigger).
 * Always covers the same fixed set of market-wide topics; there's nothing
 * left to cap since it's not looping over accounts.
 */
export function PerplexitySweepButton({ onComplete, variant = "fab" }: PerplexitySweepButtonProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RunMarketResearchSweepResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsRunning(true);
    setResult(null);
    setError(null);

    try {
      const sweepResult = await runResearchSweep();
      setResult(sweepResult);
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sweep failed.");
    } finally {
      setIsRunning(false);
    }
  }

  const panelContent = (
    <>
      {result && (
        <div className="perplexity-sweep-result" role="status">
          <p>
            <strong>{result.topicsProcessed}</strong> topic{result.topicsProcessed === 1 ? "" : "s"} checked,{" "}
            <strong>{result.signalsCreated}</strong> new signal{result.signalsCreated === 1 ? "" : "s"} found.
          </p>
          {result.errors.length > 0 && (
            <ul className="perplexity-sweep-result__errors">
              {result.errors.map((err) => (
                <li key={err.topic}>
                  {err.topic}: {err.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="perplexity-sweep-result" data-error role="alert">
          <p>{error}</p>
        </div>
      )}
    </>
  );

  if (variant === "inline") {
    return (
      <div className="feed-controls__perplexity">
        <button
          type="button"
          className="feed-action-button"
          aria-label="Run Perplexity market sweep now"
          disabled={isRunning}
          onClick={handleClick}
        >
          {isRunning ? <Loader2 size={16} strokeWidth={2} className="perplexity-sweep-fab__spin" /> : <Search size={16} strokeWidth={2} />}
          <span>Run market sweep</span>
        </button>
        <div className="perplexity-sweep-panel perplexity-sweep-panel--inline">{panelContent}</div>
      </div>
    );
  }

  return (
    <>
      <div className="perplexity-sweep-panel">{panelContent}</div>

      <button
        type="button"
        className="perplexity-sweep-fab"
        aria-label="Run Perplexity market sweep now"
        title="Run Perplexity market sweep now"
        disabled={isRunning}
        onClick={handleClick}
      >
        {isRunning ? <Loader2 size={22} strokeWidth={2} className="perplexity-sweep-fab__spin" /> : <Search size={22} strokeWidth={2} />}
      </button>
    </>
  );
}
