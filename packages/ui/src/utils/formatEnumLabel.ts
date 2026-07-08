/** "RegulatoryChange" -> "Regulatory Change" — a generic camel-case splitter, not a lookup table. */
export function formatEnumLabel(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}
