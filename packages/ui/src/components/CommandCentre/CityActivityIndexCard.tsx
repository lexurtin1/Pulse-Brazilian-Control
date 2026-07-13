import "./CommandCentre.css";

const CITIES = ["SÃO PAULO", "RIO DE JANEIRO", "BRASÍLIA"];

export function CityActivityIndexCard() {
  return (
    <div className="rail-card">
      <span className="rail-card__label">CITY ACTIVITY INDEX</span>
      {CITIES.map((city) => (
        <div key={city} className="city-index-row">
          <span className="city-index-row__name">{city}</span>
          <span className="city-index-row__bar" />
          <span className="city-index-row__value">—</span>
        </div>
      ))}
    </div>
  );
}
