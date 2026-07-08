import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { AccountMapPinDto } from "@pulse-brazil/application";
import "./BrazilMap.css";

interface BrazilMapProps {
  pins: AccountMapPinDto[];
  selectedAccountId: string | null;
  onSelectAccount?: (accountId: string) => void;
}

const BRAZIL_CENTER: [number, number] = [-51.9253, -14.235];
const BRAZIL_ZOOM = 3.6;
const SELECTED_ZOOM = 7;

export function BrazilMap({ pins, selectedAccountId, onSelectAccount }: BrazilMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const token = import.meta.env.VITE_MAPBOX_TOKEN;

  const onSelectAccountRef = useRef(onSelectAccount);
  onSelectAccountRef.current = onSelectAccount;

  useEffect(() => {
    if (!token || !containerRef.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: BRAZIL_CENTER,
      zoom: BRAZIL_ZOOM,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of markersRef.current.values()) marker.remove();
    markersRef.current.clear();

    for (const pin of pins) {
      const el = document.createElement("div");
      el.className = pin.temperatureBand === "Hot" ? "marker-dot marker-dot--hot" : "marker-dot";
      el.title = pin.name;
      el.addEventListener("click", () => onSelectAccountRef.current?.(pin.id));

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([pin.coordinate.longitude, pin.coordinate.latitude])
        .addTo(map);

      markersRef.current.set(pin.id, marker);
    }
  }, [pins]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const [id, marker] of markersRef.current) {
      marker.getElement().classList.toggle("marker-dot--selected", id === selectedAccountId);
    }

    const pin = pins.find((p) => p.id === selectedAccountId);
    if (!pin) return;

    map.flyTo({
      center: [pin.coordinate.longitude, pin.coordinate.latitude],
      zoom: SELECTED_ZOOM,
      duration: 1200,
      essential: true,
    });
  }, [selectedAccountId, pins]);

  if (!token) {
    return (
      <div className="brazil-map brazil-map--empty">
        <p>Set VITE_MAPBOX_TOKEN in packages/ui/.env.local to activate the map.</p>
      </div>
    );
  }

  return <div ref={containerRef} className="brazil-map" />;
}
