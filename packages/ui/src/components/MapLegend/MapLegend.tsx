import type { AccountMapPinDto } from "@pulse-brazil/application";
import type { MapViewMode } from "../CesiumGlobe/CesiumGlobe";
import { CLIENT_TYPE_ORDER, clientTypeLabel } from "../../utils/clientType";
import { formatCurrency } from "../../utils/formatNumbers";
import { buildValueGradientCss, PIPELINE_VALUE_SCALE_TICKS, valueToScaleT } from "../../utils/pipelineValueScale";
import "./MapLegend.css";

interface MapLegendProps {
  pins: AccountMapPinDto[];
  hiddenClientTypes: ReadonlySet<string | undefined>;
  onToggleClientType: (clientType: string | undefined) => void;
  viewMode: MapViewMode;
  onChangeViewMode: (mode: MapViewMode) => void;
}

// `undefined` stands in for "unclassified" — same sentinel convention as
// clientTypeColorVar/clientTypeLabel, so there's one code path for it
// instead of a separate "unclassified" string literal to keep in sync.
const ENTRIES = [...CLIENT_TYPE_ORDER, undefined] as const;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * One panel, one legend per view (see grilling session): Flat mode shows
 * the client-type filter pills (unchanged); Tower mode swaps them for the
 * pipeline-value gradient. The Flat/Towers toggle sits above whichever is
 * showing, and the client-type filter state itself persists across both —
 * only its color-dot presentation is Flat-mode-only.
 */
export function MapLegend({ pins, hiddenClientTypes, onToggleClientType, viewMode, onChangeViewMode }: MapLegendProps) {
  if (pins.length === 0) return null;

  return (
    <div className="map-legend">
      <div className="map-legend__mode-toggle" role="group" aria-label="Map view">
        <button
          type="button"
          className="map-legend__mode-button"
          aria-pressed={viewMode === "flat"}
          onClick={() => onChangeViewMode("flat")}
        >
          Flat
        </button>
        <button
          type="button"
          className="map-legend__mode-button"
          aria-pressed={viewMode === "tower"}
          onClick={() => onChangeViewMode("tower")}
        >
          Towers
        </button>
      </div>

      {viewMode === "flat" &&
        ENTRIES.map((clientType) => {
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

      {viewMode === "tower" && (
        <div className="map-legend__value-gradient">
          <p className="map-legend__value-heading">Open pipeline value</p>
          <div
            className="map-legend__gradient-bar"
            style={{
              background: buildValueGradientCss(cssVar("--color-value-low"), cssVar("--color-value-mid"), cssVar("--color-value-high")),
            }}
          />
          <div className="map-legend__gradient-ticks">
            {PIPELINE_VALUE_SCALE_TICKS.map((tick: number) => (
              <span
                key={tick}
                className="map-legend__gradient-tick"
                style={{ left: `${valueToScaleT(tick) * 100}%` }}
              >
                {formatCurrency(tick)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
