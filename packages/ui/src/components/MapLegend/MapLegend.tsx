import "./MapLegend.css";

export function MapLegend() {
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
