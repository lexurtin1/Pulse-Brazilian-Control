import type { AccountMapPinDto } from "@pulse-brazil/application";
import { CLIENT_TYPE_ORDER, clientTypeLabel } from "../../utils/clientType";
import "./MapLegend.css";

interface MapLegendProps {
  pins: AccountMapPinDto[];
  hiddenClientTypes: ReadonlySet<string | undefined>;
  onToggleClientType: (clientType: string | undefined) => void;
}

// `undefined` stands in for "unclassified" — same sentinel convention as
// clientTypeColorVar/clientTypeLabel, so there's one code path for it
// instead of a separate "unclassified" string literal to keep in sync.
const ENTRIES = [...CLIENT_TYPE_ORDER, undefined] as const;

export function MapLegend({ pins, hiddenClientTypes, onToggleClientType }: MapLegendProps) {
  if (pins.length === 0) return null;

  return (
    <div className="map-legend">
      {ENTRIES.map((clientType) => {
        const active = !hiddenClientTypes.has(clientType);
        const key = clientType ?? "unclassified";
        return (
          <button
            key={key}
            type="button"
            className="map-legend__pill"
            aria-pressed={active}
            onClick={() => onToggleClientType(clientType)}
          >
            <span className="map-legend__dot" data-client-type={key} aria-hidden="true" />
            {clientTypeLabel(clientType)}
          </button>
        );
      })}
    </div>
  );
}
