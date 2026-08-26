import type { AccountMapPinDto } from "@pulse-brazil/application";
import { CLIENT_TYPE_ORDER, clientTypeLabel, primaryClientType } from "../../utils/clientType";
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

/** The map's only legend: one filter pill per client type, each carrying the color its dots are drawn in. */
export function MapLegend({ pins, hiddenClientTypes, onToggleClientType }: MapLegendProps) {
  if (pins.length === 0) return null;

  // Every real client type keeps a pill whether or not any account currently
  // has it — a type filtered down to nothing must stay clickable to bring it
  // back. "Unclassified" is different: it isn't a type, it's the absence of
  // one, so on a fully-reconciled map it would be a pill that filters
  // nothing. It appears only while something is actually unclassified.
  const hasUnclassified = pins.some((pin) => primaryClientType(pin.clientTypes) === undefined);

  return (
    <div className="map-legend">
      {ENTRIES.filter((clientType) => clientType !== undefined || hasUnclassified).map((clientType) => {
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
