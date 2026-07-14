import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { clearSignals } from "../../api/client";
import "./ClearFeedButton.css";

interface ClearFeedButtonProps {
  /** Called after a successful clear, so the caller can refresh the (now empty) signal feed. */
  onCleared: () => void;
}

const CONFIRM_WINDOW_MS = 4000;

/**
 * Permanently deletes every signal in the database — irreversible, so the
 * first click only arms a confirmation state; the delete only fires on a
 * second click within CONFIRM_WINDOW_MS. Per the operator's explicit
 * request, this is a real delete-all, not a client-only view clear.
 */
export function ClearFeedButton({ onCleared }: ClearFeedButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    };
  }, []);

  async function handleClick() {
    if (!confirming) {
      setConfirming(true);
      setError(null);
      confirmTimeoutRef.current = setTimeout(() => setConfirming(false), CONFIRM_WINDOW_MS);
      return;
    }

    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    setConfirming(false);
    setIsClearing(true);
    setError(null);

    try {
      await clearSignals();
      onCleared();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed.");
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <div className="clear-feed-button">
      <button
        type="button"
        className="feed-action-button feed-action-button--danger"
        data-confirming={confirming || undefined}
        aria-label={confirming ? "Click again to permanently delete all signals" : "Clear the live feed"}
        disabled={isClearing}
        onClick={handleClick}
      >
        {isClearing ? <Loader2 size={16} strokeWidth={2} className="clear-feed-button__spin" /> : <Trash2 size={16} strokeWidth={2} />}
        <span>{confirming ? "Click again to confirm" : "Clear feed"}</span>
      </button>

      {error && (
        <div className="perplexity-sweep-result" data-error role="alert">
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
