import type { AccountMapPinDto } from "@pulse-brazil/application";
import "./MapLegend.css";

interface MapLegendProps {
  pins: AccountMapPinDto[];
}

const BANDS = [
  { band: "Hot", label: "Hot" },
  { band: "Warm", label: "Warm" },
  { band: "Cool", label: "Cool" },
  { band: "Cold", label: "Cold" },
] as const;

export function MapLegend({ pins }: MapLegendProps) {
  if (pins.length === 0) return null;

  return (
    <div className="map-legend">
      {BANDS.map(({ band, label }) => (
        <div key={band} className="map-legend__item">
          <span className="map-legend__dot" data-band={band} aria-hidden="true" />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
