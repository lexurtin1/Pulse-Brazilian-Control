/**
 * Real Salesforce stage values, shown verbatim in the UI — no mapping to a
 * generic early/mid/late bucket. `Live` and `Lost` are closed stages
 * (revenue already flowing, or the deal fell through); only the other four
 * count as "open" pipeline (see `Deal.isOpen`).
 */
export enum DealStage {
  Discovery = "Discovery",
  Prospect = "Prospect",
  Qualified = "Qualified",
  Signed = "Signed",
  Live = "Live",
  Lost = "Lost",
}

/**
 * The four open stages in the order a deal actually moves through them,
 * earliest first — which is NOT the declaration order above (that is
 * alphabetical-ish accident, and Discovery landing first there has misled
 * at least one reader already).
 *
 * Declared here rather than inferred at a call site because it is a fact
 * about how Calastone sells in Brazil, not a display preference: anything
 * that shows progress through the pipeline has to agree on it, and a
 * consumer that ordered these differently would be describing a different
 * sales process.
 */
export const OPEN_DEAL_STAGE_ORDER: readonly DealStage[] = [
  DealStage.Prospect,
  DealStage.Discovery,
  DealStage.Qualified,
  DealStage.Signed,
];
