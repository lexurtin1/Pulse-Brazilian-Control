import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { AccountMapPinDto } from "@pulse-brazil/application";
import { clientTypeColorVar, primaryClientType } from "../../utils/clientType";
import { formatCurrency } from "../../utils/formatNumbers";
import "./CesiumGlobe.css";

interface CesiumGlobeProps {
  pins: AccountMapPinDto[];
  selectedAccountId: string | null;
  onSelectAccount?: (accountId: string) => void;
}

interface HoverInfo {
  name: string;
  value: number;
  x: number;
  y: number;
}

// Cesium.Color.fromCssColorString takes a CSS color string directly — no
// need for BrazilMap's [r,g,b] array conversion (deck.gl-specific).
function cssColorString(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

// Same real extent BrazilMap fit to (mainland + offshore islands), used
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

// Account dots are the main thing on this page, at every zoom level — an
// earlier version shrank them toward a "precise anchor" as the camera got
// close, which made them unreadable up close (the opposite of the goal). Dots
// now hold one fixed screen-space pixel size regardless of camera distance.
const ACCOUNT_PIN_BASE_SIZE = 40;
const ACCOUNT_PIN_SELECTED_BASE_SIZE = 52;

const ACCOUNT_PIN_OUTLINE_WIDTH = 3;
const ACCOUNT_PIN_SELECTED_OUTLINE_WIDTH = 4;

// Account dots anchor with NONE at sea level rather than clamping to terrain:
// disableDepthTestDistance is POSITIVE_INFINITY on every dot, so they draw on
// top regardless of the 3D surface beneath them, and a fixed ellipsoid anchor
// is a number no terrain-tile load can nudge (which is what read as pins
// "drifting" at max zoom when they were terrain-clamped).
const PIN_HEIGHT_REFERENCE = Cesium.HeightReference.NONE;

// "Feel alive": every dot gently breathes (size oscillation) on a loop rather
// than sitting dead-still. The selected dot pulses harder/faster so it still
// reads as distinct now that pulsing isn't unique to it. Each dot gets a stable
// per-id phase offset (not random-per-render, not synced) so the whole map
// doesn't blink in unison like a single strobing light.
const AMBIENT_PULSE_AMPLITUDE = 0.12;
const AMBIENT_PULSE_PERIOD_MS = 2600;
const SELECTED_PULSE_AMPLITUDE = 0.22;
const SELECTED_PULSE_PERIOD_MS = 1400;

function stablePhase(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

function pulseFactor(nowMs: number, amplitude: number, periodMs: number, phase: number): number {
  const cyclePosition = (nowMs / periodMs + phase) % 1;
  return 1 + amplitude * Math.sin(cyclePosition * Math.PI * 2);
}

// Cesium's zoom-in floor defaults to 1m from the ellipsoid, which is far
// past the point where camera-relative floating-point precision breaks
// down — that precision loss is what reads as pins "drifting" off their
// anchor at max zoom. Flooring the zoom keeps the camera far enough out
// that positions stay numerically stable.
const MINIMUM_ZOOM_DISTANCE_METERS = 100;

// Nothing on this map is clustered. Cesium's EntityCluster was tried and
// removed: every account is its own dot, at every zoom.

export function CesiumGlobe({ pins, selectedAccountId, onSelectAccount }: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const accountsDataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const onSelectAccountRef = useRef(onSelectAccount);
  onSelectAccountRef.current = onSelectAccount;
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const token = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
    if (token) Cesium.Ion.defaultAccessToken = token;

    // World terrain gives the globe its 3D relief. Account dots don't sample it —
    // they float at a fixed ellipsoid anchor and draw on top (see PIN_HEIGHT_REFERENCE).
    const worldTerrain = Cesium.Terrain.fromWorldTerrain();

    const viewer = new Cesium.Viewer(containerRef.current, {
      terrain: worldTerrain,
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
    // used to open on. Runs on every mount — the toggle in App.tsx
    // conditionally renders CesiumGlobe, so mounting it always replays this.
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(BRAZIL_CENTER_LONGITUDE, BRAZIL_CENTER_LATITUDE, SPACE_ALTITUDE_METERS),
    });
    viewer.camera.flyTo({
      destination: BRAZIL_RECTANGLE,
      duration: FLY_IN_DURATION_SECONDS,
    });

    // Explicit rather than relying on Cesium's defaults — belt-and-suspenders
    // against any input getting silently disabled by a future config change.
    const cameraController = viewer.scene.screenSpaceCameraController;
    cameraController.enableZoom = true;
    cameraController.enableRotate = true;
    cameraController.enableTilt = true;
    cameraController.enableTranslate = true;
    cameraController.enableInputs = true;
    cameraController.minimumZoomDistance = MINIMUM_ZOOM_DISTANCE_METERS;

    const accountsDataSource = new Cesium.CustomDataSource("accounts");
    viewer.dataSources.add(accountsDataSource);
    accountsDataSourceRef.current = accountsDataSource;

    // Click a dot → open that account. No buffer step: the only reason to
    // click a pin is to see the account behind it.
    viewer.screenSpaceEventHandler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(click.position);
      if (!picked) return;

      const accountId = picked.id?.properties?.accountId?.getValue();
      if (accountId) onSelectAccountRef.current?.(accountId);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Hover tooltip — account name + open pipeline value, in either view mode.
    // Cesium's canvas has no native title/hover affordance of its own. Every
    // hoverable entity carries its own hoverName/hoverValue.
    viewer.screenSpaceEventHandler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      const picked = viewer.scene.pick(movement.endPosition);
      const properties = picked?.id?.properties;
      const name = properties?.hoverName?.getValue() as string | undefined;
      if (name) {
        const value = (properties?.hoverValue?.getValue() as number | undefined) ?? 0;
        setHoverInfo({ name, value, x: movement.endPosition.x, y: movement.endPosition.y });
        return;
      }
      setHoverInfo(null);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    viewerRef.current = viewer;

    const resizeObserver = new ResizeObserver(() => viewer.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      viewer.destroy();
      viewerRef.current = null;
      accountsDataSourceRef.current = null;
    };
  }, []);

  // Account dots as Cesium entities, colored by client type — the same palette
  // the legend, Top Open Deals, Live Feed and the Account Dossier header use,
  // so a client type is always the same color wherever it appears.
  useEffect(() => {
    const viewer = viewerRef.current;
    const accountsDataSource = accountsDataSourceRef.current;
    if (!viewer || !accountsDataSource) return;

    const surfaceColor = Cesium.Color.fromCssColorString(cssColorString("--color-surface"));
    const activeColor = Cesium.Color.fromCssColorString(cssColorString("--color-primary-active"));

    accountsDataSource.entities.removeAll();

    for (const pin of pins) {
      const clientColor = Cesium.Color.fromCssColorString(cssColorString(clientTypeColorVar(primaryClientType(pin.clientTypes))));
      const selected = pin.id === selectedAccountId;
      const phase = stablePhase(pin.id);
      const baseSize = selected ? ACCOUNT_PIN_SELECTED_BASE_SIZE : ACCOUNT_PIN_BASE_SIZE;
      const amplitude = selected ? SELECTED_PULSE_AMPLITUDE : AMBIENT_PULSE_AMPLITUDE;
      const periodMs = selected ? SELECTED_PULSE_PERIOD_MS : AMBIENT_PULSE_PERIOD_MS;

      accountsDataSource.entities.add({
        id: `account-pin-${pin.id}`,
        position: Cesium.Cartesian3.fromDegrees(pin.coordinate.longitude, pin.coordinate.latitude),
        properties: {
          accountId: pin.id,
          hoverName: pin.name,
          hoverValue: pin.openPipelineValue,
        },
        point: {
          pixelSize: new Cesium.CallbackProperty(() => baseSize * pulseFactor(Date.now(), amplitude, periodMs, phase), false),
          color: clientColor,
          outlineColor: selected ? activeColor : surfaceColor,
          outlineWidth: selected ? ACCOUNT_PIN_SELECTED_OUTLINE_WIDTH : ACCOUNT_PIN_OUTLINE_WIDTH,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: PIN_HEIGHT_REFERENCE,
        },
      });
    }
  }, [pins, selectedAccountId]);

  // Selecting an account recenters the camera on it but keeps whatever
  // altitude the user is currently at — clicking a pin should never yank
  // the zoom level out from under someone who's already framed a close-up.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const pin = pins.find((p) => p.id === selectedAccountId);
    if (!pin) return;

    const currentAltitude = viewer.camera.positionCartographic.height;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(pin.coordinate.longitude, pin.coordinate.latitude, currentAltitude),
      duration: 1.2,
    });
  }, [selectedAccountId, pins]);

  return (
    <div className="cesium-globe">
      <div ref={containerRef} className="cesium-globe__canvas" />
      {hoverInfo && (
        <div className="cesium-globe__tooltip" style={{ left: hoverInfo.x, top: hoverInfo.y }} aria-hidden="true">
          <span className="cesium-globe__tooltip-name">{hoverInfo.name}</span>
          <span className="cesium-globe__tooltip-value">
            {hoverInfo.value > 0 ? `${formatCurrency(hoverInfo.value)} open pipeline` : "No open pipeline"}
          </span>
        </div>
      )}
      {/* Same accessible-alternative pattern as BrazilMap: Cesium's canvas
          isn't focusable/screen-reader-visible, so real tabbable buttons
          mirror each dot's click behavior. */}
      <div className="cesium-globe__a11y-pins">
        {pins.map((pin) => (
          <button
            key={pin.id}
            type="button"
            className="cesium-globe__a11y-pin"
            aria-label={pin.openPipelineValue > 0 ? `${pin.name} — ${formatCurrency(pin.openPipelineValue)} open pipeline` : pin.name}
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
