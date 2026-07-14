/**
 * Every number on this dashboard is a whole number, everywhere — no decimal
 * places on any card. Display currency is GBP (£) — this is a formatting
 * choice only, not a conversion: the underlying figures are the raw BRL
 * amounts from the Salesforce export, just displayed with a £ symbol. If
 * real BRL→GBP conversion is ever wanted, that's a separate change (needs
 * an exchange rate source).
 */
const gbpWholeFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatCurrency(value: number): string {
  return gbpWholeFormatter.format(Math.round(value));
}

/** "+£1,234" / "-£1,234" — a signed whole-number delta for "vs. previous upload" footnotes. */
export function formatCurrencyDelta(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${gbpWholeFormatter.format(Math.abs(rounded))}`;
}

/** "13 Jul" — used for "as of" / "vs. upload on" footnotes. */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(iso));
}

/** "13 Jul, 08:23 LON" — explicit timezone label since this sits next to a BRT-labeled clock in the header (freshness indicator tooltip). */
export function formatDateTimeLondon(iso: string): string {
  const date = new Date(iso);
  const datePart = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "short" }).format(date);
  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${datePart}, ${timePart} LON`;
}

/** Whole-number count with thousands separators, e.g. "1,234". */
export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-GB").format(Math.round(value));
}

/** "+3" / "-2" — a signed whole-number delta for count-based footnotes. */
export function formatCountDelta(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${formatCount(Math.abs(rounded))}`;
}
