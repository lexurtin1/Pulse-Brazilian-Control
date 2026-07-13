import "./CommandCentre.css";

interface KpiCardProps {
  label: string;
  value?: string;
  footnote: string;
  variant?: "default" | "risk";
  /** Calastone brand accent (top border + label color) — scoped to specific tiles, not a general theming knob. */
  accent?: "blue" | "teal";
}

export function KpiCard({ label, value, footnote, variant = "default", accent }: KpiCardProps) {
  return (
    <div className="kpi-card" data-variant={variant} data-accent={accent}>
      <span className="kpi-card__label">{label}</span>
      <span className="kpi-card__value" data-empty={!value || undefined}>
        {value ?? "—"}
      </span>
      <span className="kpi-card__footnote">{footnote}</span>
    </div>
  );
}
