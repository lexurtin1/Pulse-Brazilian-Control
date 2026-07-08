import type { AccountMapPinDto } from "@pulse-brazil/application";
import "./MapLegend.css";

interface MapLegendProps {
  pins: AccountMapPinDto[];
}

export function MapLegend({ pins }: MapLegendProps) {
  if (pins.length === 0) return null;

  return (
    <div className="map-legend">
      <div className="map-legend__item">
        <span className="map-legend__dot map-legend__dot--hot" aria-hidden="true" />
        <span>Hot account</span>
      </div>
      <div className="map-legend__item">
        <span className="map-legend__dot map-legend__dot--cold" aria-hidden="true" />
        <span>Warm / Cool / Cold account</span>
      </div>
    </div>
  );
}
