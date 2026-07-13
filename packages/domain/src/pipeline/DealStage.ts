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
