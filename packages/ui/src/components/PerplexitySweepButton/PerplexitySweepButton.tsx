import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { RunMarketResearchSweepResult } from "@pulse-brazil/application";
import { runResearchSweep } from "../../api/client";
import "./PerplexitySweepButton.css";

interface PerplexitySweepButtonProps {
  /** Called after a completed sweep (even with per-account errors), so the caller can refresh the signal feed. */
  onComplete?: () => void;
}

/**
 * Manually fires the same GET /api/signals/research-sweep endpoint Vercel
 * Cron hits on schedule — real Perplexity calls, real spend, no confirmation
 * step (per the operator's explicit request for a one-press manual trigger).
 */
export function PerplexitySweepButton({ onComplete }: PerplexitySweepButtonProps) {
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

  return (
    <>
      <button
        type="button"
        className="perplexity-sweep-fab"
        aria-label="Run Perplexity research sweep now"
        title="Run Perplexity research sweep now"
        disabled={isRunning}
        onClick={handleClick}
      >
        {isRunning ? <Loader2 size={22} strokeWidth={2} className="perplexity-sweep-fab__spin" /> : <Search size={22} strokeWidth={2} />}
      </button>

      {result && (
        <div className="perplexity-sweep-result" role="status">
          <p>
            <strong>{result.accountsProcessed}</strong> account{result.accountsProcessed === 1 ? "" : "s"} processed,{" "}
            <strong>{result.signalsCreated}</strong> signal{result.signalsCreated === 1 ? "" : "s"} created.
          </p>
          {result.errors.length > 0 && (
            <ul className="perplexity-sweep-result__errors">
              {result.errors.map((err) => (
                <li key={err.accountId}>{err.message}</li>
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
}
