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

const relativeDayFormatter = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

/**
 * "today" / "yesterday" / "6 days ago" / "in 3 days" — for the Brazil update,
 * where how long ago something happened is the point and the exact date is
 * detail.
 *
 * Both sides are floored to local midnight before differencing, so "6 days
 * ago" means six calendar days, not 144 hours: a contact yesterday evening
 * should never read as "today" just because it was under 24 hours ago.
 */
export function formatRelativeDay(iso: string, now: Date = new Date()): string {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return "";

  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(target) - startOfDay(now)) / 86_400_000);

  if (Math.abs(days) < 7) return relativeDayFormatter.format(days, "day");
  if (Math.abs(days) < 28) return relativeDayFormatter.format(Math.round(days / 7), "week");
  return relativeDayFormatter.format(Math.round(days / 30), "month");
}
