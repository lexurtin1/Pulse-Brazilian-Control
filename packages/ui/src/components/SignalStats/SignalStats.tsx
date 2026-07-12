import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { SignalDto } from "@pulse-brazil/application";
import { categorizeSignal } from "../../utils/categorizeSignal";
import "./SignalStats.css";

interface SignalStatsProps {
  signals: SignalDto[];
}

// A "high confidence" cutoff for a 0-1 score — strict enough to stay
// meaningfully smaller than the total signal count without requiring
// near-certainty.
const HIGH_PRIORITY_CONFIDENCE_THRESHOLD = 0.8;

// Tweens a proxy object rather than a React state value so re-renders don't
// fight the animation — the DOM node's text is written directly on each
// gsap tick and React never re-renders mid-count.
function useCountUp(value: number) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const proxy = { value: 0 };
    const tween = gsap.to(proxy, {
      value,
      duration: 1,
      ease: "power1.out",
      onUpdate: () => {
        el.textContent = String(Math.round(proxy.value));
      },
    });

    return () => {
      tween.kill();
    };
  }, [value]);

  return ref;
}

export function SignalStats({ signals }: SignalStatsProps) {
  const marketsMonitored = new Set(
    signals.map((signal) => signal.geographicScope?.region).filter((region): region is string => Boolean(region)),
  ).size;

  const competitorEvents = signals.filter((signal) => categorizeSignal(signal) === "Competitor").length;

  const highPriority = signals.filter((signal) => signal.confidenceScore >= HIGH_PRIORITY_CONFIDENCE_THRESHOLD).length;

  const totalRef = useCountUp(signals.length);
  const headlineMarketsRef = useCountUp(marketsMonitored);
  const marketsRef = useCountUp(marketsMonitored);
  const competitorRef = useCountUp(competitorEvents);
  const priorityRef = useCountUp(highPriority);

  if (signals.length === 0) return null;

  return (
    <div className="signal-stats">
      <p className="signal-stats__headline">
        <span className="signal-stats__headline-value" ref={totalRef}>
          0
        </span>{" "}
        signals — live across <span className="signal-stats__headline-value" ref={headlineMarketsRef}>
          0
        </span>{" "}
        markets, tracked in real time
      </p>
      <div className="signal-stats__row">
        <div className="signal-stats__stat">
          <span className="signal-stats__value" ref={marketsRef}>
            0
          </span>
          <span className="signal-stats__caption">Markets Monitored</span>
        </div>
        <div className="signal-stats__stat">
          <span className="signal-stats__value" ref={competitorRef}>
            0
          </span>
          <span className="signal-stats__caption">Competitor Events</span>
        </div>
        <div className="signal-stats__stat">
          <span className="signal-stats__value" ref={priorityRef}>
            0
          </span>
          <span className="signal-stats__caption">High Priority</span>
        </div>
      </div>
    </div>
  );
}
