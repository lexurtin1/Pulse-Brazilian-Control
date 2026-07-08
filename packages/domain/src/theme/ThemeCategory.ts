/**
 * The fixed vocabulary of market themes Pulse Brazil tracks today.
 * `Other` exists so a new Theme can be created ahead of the category list
 * being extended, rather than forcing a mis-categorization.
 */
export enum ThemeCategory {
  OrderRouting = "OrderRouting",
  Regulation = "Regulation",
  CrossBorder = "CrossBorder",
  Tokenisation = "Tokenisation",
  ETF = "ETF",
  Competition = "Competition",
  Other = "Other",
}
