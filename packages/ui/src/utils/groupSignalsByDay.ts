import type { SignalDto } from "@pulse-brazil/application";

export interface SignalDayGroup {
  id: string;
  label: string;
  signals: SignalDto[];
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(now: Date, other: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(now).getTime() - startOfDay(other).getTime()) / MS_PER_DAY);
}

/**
 * Buckets signals into Today / Yesterday / Earlier this week / Earlier,
 * preserving the caller's ordering within each bucket. Assumes `signals` is
 * already sorted (SignalFeed sorts desc by dateObserved before calling
 * this). `now` should be computed once by the caller (e.g. via
 * `useState(() => new Date())`), not freshly on every render, so grouping
 * stays stable across re-renders.
 */
export function groupSignalsByDay(signals: SignalDto[], now: Date): SignalDayGroup[] {
  const buckets: SignalDayGroup[] = [
    { id: "today", label: "Today", signals: [] },
    { id: "yesterday", label: "Yesterday", signals: [] },
    { id: "this-week", label: "Earlier this week", signals: [] },
    { id: "earlier", label: "Earlier", signals: [] },
  ];

  for (const signal of signals) {
    const diff = daysBetween(now, new Date(signal.dateObserved));
    if (diff <= 0) {
      buckets[0]!.signals.push(signal);
    } else if (diff === 1) {
      buckets[1]!.signals.push(signal);
    } else if (diff <= 6) {
      buckets[2]!.signals.push(signal);
    } else {
      buckets[3]!.signals.push(signal);
    }
  }

  return buckets.filter((group) => group.signals.length > 0);
}
