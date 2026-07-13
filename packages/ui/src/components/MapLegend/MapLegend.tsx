import type { AccountMapPinDto } from "@pulse-brazil/application";
import { CLIENT_TYPE_ORDER, clientTypeLabel } from "../../utils/clientType";
import "./MapLegend.css";

interface MapLegendProps {
  pins: AccountMapPinDto[];
}

const ENTRIES = [...CLIENT_TYPE_ORDER, undefined] as const;

export function MapLegend({ pins }: MapLegendProps) {
  if (pins.length === 0) return null;

  return (
    <div className="map-legend" tabIndex={0}>
      <span className="map-legend__toggle" aria-hidden="true">
        Client type
      </span>
      <div className="map-legend__panel">
        {ENTRIES.map((clientType) => (
          <div key={clientType ?? "unclassified"} className="map-legend__item">
            <span className="map-legend__dot" data-client-type={clientType ?? "unclassified"} aria-hidden="true" />
            <span>{clientTypeLabel(clientType)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
