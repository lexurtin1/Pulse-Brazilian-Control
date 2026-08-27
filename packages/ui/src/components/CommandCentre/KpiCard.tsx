import "./CommandCentre.css";

interface KpiCardProps {
  label: string;
  value?: string;
  /**
   * A second figure of the same kind, shown under the headline. Weighted and
   * unweighted pipeline are one fact seen two ways, so they read better as
   * one card than as two competing tiles — and the strip only has room for
   * four.
   */
  secondary?: { label: string; value: string };
  footnote: string;
  variant?: "default" | "risk";
  /** Calastone brand accent (top border + label color) — scoped to specific tiles, not a general theming knob. */
  accent?: "blue" | "teal";
}

export function KpiCard({ label, value, secondary, footnote, variant = "default", accent }: KpiCardProps) {
  return (
    <div className="kpi-card" data-variant={variant} data-accent={accent}>
      <span className="kpi-card__label">{label}</span>
      <span className="kpi-card__value" data-empty={!value || undefined}>
        {value ?? "—"}
      </span>
      {secondary && (
        <span className="kpi-card__secondary">
          <span className="kpi-card__secondary-label">{secondary.label}</span>
          <span className="kpi-card__secondary-value">{secondary.value}</span>
        </span>
      )}
      <span className="kpi-card__footnote">{footnote}</span>
    </div>
  );
}
