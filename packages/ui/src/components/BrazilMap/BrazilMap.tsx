import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
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

// OpenFreeMap: free, keyless vector tiles for MapLibre GL JS — no account,
// no API token, no usage limits. "positron" is a clean light/muted style,
// matching Soft Quartz's calm aesthetic better than a busier default style.
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export function BrazilMap({ pins, selectedAccountId, onSelectAccount }: BrazilMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  const onSelectAccountRef = useRef(onSelectAccount);
  onSelectAccountRef.current = onSelectAccount;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: BRAZIL_CENTER,
      zoom: BRAZIL_ZOOM,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    mapRef.current = map;

    // MapLibre doesn't detect CSS-driven container resizes on its own (e.g.
    // the signal feed collapsing/expanding changes this container's width
    // via a flex layout) — without this the canvas stays the old size and
    // visibly misaligns until the window itself is resized.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of markersRef.current.values()) marker.remove();
    markersRef.current.clear();

    for (const pin of pins) {
      const el = document.createElement("div");
      const bandClass = pin.temperatureBand ? ` marker-dot--${pin.temperatureBand.toLowerCase()}` : "";
      el.className = `marker-dot${bandClass}`;
      el.title = pin.name;
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", pin.name);
      el.addEventListener("click", () => onSelectAccountRef.current?.(pin.id));
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectAccountRef.current?.(pin.id);
        }
      });

      const marker = new maplibregl.Marker({ element: el })
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

  return <div ref={containerRef} className="brazil-map" />;
}
