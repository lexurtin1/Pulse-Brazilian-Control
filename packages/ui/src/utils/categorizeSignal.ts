import type { SignalDto } from "@pulse-brazil/application";

/** Display bucket a signal card is colored/filtered by — a lossy collapse of the 9-value SignalType taxonomy. */
export type SignalCategory = "Regulatory" | "Competitor" | "Market" | "CallNote";

export const SIGNAL_CATEGORIES: readonly SignalCategory[] = ["Regulatory", "Competitor", "Market", "CallNote"];

export const SIGNAL_CATEGORY_LABEL: Record<SignalCategory, string> = {
  Regulatory: "Regulatory",
  Competitor: "Competitor",
  Market: "Market",
  CallNote: "Call note",
};

/**
 * Source wins over type: a manually-logged call note stays visually distinct
 * as "Call note" even if its type happens to be RegulatoryChange or
 * CompetitiveIntelligence, since the point of the bucket is provenance
 * (a human typed this), not subject matter.
 */
export function categorizeSignal(signal: Pick<SignalDto, "type" | "source">): SignalCategory {
  if (signal.source === "ManualEntry") return "CallNote";
  if (signal.type === "RegulatoryChange") return "Regulatory";
  if (signal.type === "CompetitiveIntelligence") return "Competitor";
  return "Market";
}
