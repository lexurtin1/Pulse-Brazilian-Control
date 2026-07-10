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
 * The limit input caps how many eligible accounts get processed, so a manual
 * test run doesn't have to mean spending on the whole book at once — the
 * scheduled cron run always omits it and covers everyone eligible.
 */
const DEFAULT_LIMIT = 3;

export function PerplexitySweepButton({ onComplete }: PerplexitySweepButtonProps) {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RunMarketResearchSweepResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsRunning(true);
    setResult(null);
    setError(null);

    try {
      const sweepResult = await runResearchSweep(limit);
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
      <div className="perplexity-sweep-panel">
        <label className="perplexity-sweep-panel__limit">
          Run for
          <input
            type="number"
            min={1}
            max={200}
            value={limit}
            disabled={isRunning}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next) && next >= 1) setLimit(Math.floor(next));
            }}
          />
          account{limit === 1 ? "" : "s"}
        </label>

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
      </div>

      <button
        type="button"
        className="perplexity-sweep-fab"
        aria-label={`Run Perplexity research sweep now, limited to ${limit} account${limit === 1 ? "" : "s"}`}
        title={`Run Perplexity research sweep now, limited to ${limit} account${limit === 1 ? "" : "s"}`}
        disabled={isRunning}
        onClick={handleClick}
      >
        {isRunning ? <Loader2 size={22} strokeWidth={2} className="perplexity-sweep-fab__spin" /> : <Search size={22} strokeWidth={2} />}
      </button>
    </>
  );
}
