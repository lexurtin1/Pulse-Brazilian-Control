import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { AccountMapPinDto } from "@pulse-brazil/application";
import { clientTypeColorVar, primaryClientType } from "../../utils/clientType";
import "./CesiumGlobe.css";

interface CesiumGlobeProps {
  pins: AccountMapPinDto[];
  selectedAccountId: string | null;
  onSelectAccount?: (accountId: string) => void;
}

// Cesium.Color.fromCssColorString takes a CSS color string directly — no
// need for BrazilMap's [r,g,b] array conversion (deck.gl-specific).
function cssColorString(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

// Same real extent BrazilMap fits to (mainland + offshore islands), used
// here for the globe's default camera view.
const BRAZIL_RECTANGLE = Cesium.Rectangle.fromDegrees(-74, -34, -29, 6);

// Roughly Brazil's centroid — the entrance shot starts pulled back directly
// above this point so the fly-in reads as "descending onto Brazil," not an
// arbitrary point on the globe.
const BRAZIL_CENTER_LONGITUDE = -51.5;
const BRAZIL_CENTER_LATITUDE = -14;

// High enough to see the globe's curvature (most of the Earth's disc), so
// the entrance reads as "starting from space" before descending.
const SPACE_ALTITUDE_METERS = 25_000_000;
const FLY_IN_DURATION_SECONDS = 3;

const SELECTED_ALTITUDE_METERS = 80_000;

export function CesiumGlobe({ pins, selectedAccountId, onSelectAccount }: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const onSelectAccountRef = useRef(onSelectAccount);
  onSelectAccountRef.current = onSelectAccount;

  useEffect(() => {
    if (!containerRef.current) return;

    const token = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
    if (token) Cesium.Ion.defaultAccessToken = token;

    const viewer = new Cesium.Viewer(containerRef.current, {
      terrain: Cesium.Terrain.fromWorldTerrain(),
      baseLayer: Cesium.ImageryLayer.fromProviderAsync(Cesium.createWorldImageryAsync(), {}),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      vrButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
    });

    // Cinematic entrance: start pulled back far enough to see the globe's
    // curvature, then fly down into the same fitted Brazil view BrazilMap
    // opens on. Runs on every mount — the toggle in App.tsx conditionally
    // renders BrazilMap vs CesiumGlobe, so switching to the globe view
    // always mounts a fresh instance and replays this.
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(BRAZIL_CENTER_LONGITUDE, BRAZIL_CENTER_LATITUDE, SPACE_ALTITUDE_METERS),
    });
    viewer.camera.flyTo({
      destination: BRAZIL_RECTANGLE,
      duration: FLY_IN_DURATION_SECONDS,
    });

    viewer.screenSpaceEventHandler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(click.position);
      const accountId = picked?.id?.properties?.accountId?.getValue();
      if (accountId) onSelectAccountRef.current?.(accountId);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewerRef.current = viewer;

    const resizeObserver = new ResizeObserver(() => viewer.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // Account pins as Cesium point Entities — the same ClientType colors as
  // BrazilMap's deck.gl ScatterplotLayer, so an account reads as the same
  // color in both views.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.removeAll();

    const surfaceColor = Cesium.Color.fromCssColorString(cssColorString("--color-surface"));
    const activeColor = Cesium.Color.fromCssColorString(cssColorString("--color-primary-active"));

    for (const pin of pins) {
      const fillColor = Cesium.Color.fromCssColorString(cssColorString(clientTypeColorVar(primaryClientType(pin.clientTypes))));
      const selected = pin.id === selectedAccountId;

      viewer.entities.add({
        id: `account-pin-${pin.id}`,
        position: Cesium.Cartesian3.fromDegrees(pin.coordinate.longitude, pin.coordinate.latitude),
        properties: { accountId: pin.id },
        point: {
          pixelSize: selected ? 14 : 10,
          color: fillColor,
          outlineColor: selected ? activeColor : surfaceColor,
          outlineWidth: selected ? 3 : 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
  }, [pins, selectedAccountId]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const pin = pins.find((p) => p.id === selectedAccountId);
    if (!pin) return;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(pin.coordinate.longitude, pin.coordinate.latitude, SELECTED_ALTITUDE_METERS),
      duration: 1.2,
    });
  }, [selectedAccountId, pins]);

  return (
    <div className="cesium-globe">
      <div ref={containerRef} className="cesium-globe__canvas" />
      {/* Same accessible-alternative pattern as BrazilMap: Cesium's canvas
          isn't focusable/screen-reader-visible, so real tabbable buttons
          mirror each pin's click behavior. */}
      <div className="cesium-globe__a11y-pins">
        {pins.map((pin) => (
          <button
            key={pin.id}
            type="button"
            className="cesium-globe__a11y-pin"
            aria-label={pin.name}
            aria-pressed={pin.id === selectedAccountId}
            onClick={() => onSelectAccount?.(pin.id)}
          >
            {pin.name}
          </button>
        ))}
      </div>
    </div>
  );
}
