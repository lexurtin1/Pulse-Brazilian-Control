import "./CommandCentre.css";

interface KpiCardProps {
  label: string;
  value?: string;
  footnote: string;
  variant?: "default" | "risk";
}

export function KpiCard({ label, value, footnote, variant = "default" }: KpiCardProps) {
  return (
    <div className="kpi-card" data-variant={variant}>
      <span className="kpi-card__label">{label}</span>
      <span className="kpi-card__value" data-empty={!value || undefined}>
        {value ?? "—"}
      </span>
      <span className="kpi-card__footnote">{footnote}</span>
    </div>
  );
}
