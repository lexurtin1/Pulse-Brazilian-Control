import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { AccountMapPinDto, LocationRecordMapPinDto } from "@pulse-brazil/application";
import { formatCurrency } from "../../utils/formatNumbers";
import {
  stubTowerHeightMeters,
  towerRadiusMeters,
  towerScaleAltitudeMeters,
  valueColorHex,
  valueToScaleT,
  valueToTowerHeightMeters,
} from "../../utils/pipelineValueScale";
import "./CesiumGlobe.css";

export type MapViewMode = "flat" | "tower";

interface CesiumGlobeProps {
  pins: AccountMapPinDto[];
  locationPins?: LocationRecordMapPinDto[];
  selectedAccountId: string | null;
  viewMode: MapViewMode;
  onSelectAccount?: (accountId: string) => void;
  onSelectLocationPin?: (pin: LocationRecordMapPinDto) => void;
}

interface HoverInfo {
  name: string;
  value: number;
  x: number;
  y: number;
}

// A module-level constant, NOT a fresh `= []` default in the destructure. The
// entity effect depends on `locationPins`, and the hover tooltip calls
// setHoverInfo on every mouse-move — with an inline default, each of those
// re-renders minted a new array identity and tore down and rebuilt every entity
// on the map. Now that towers also rebuild on camera change, that churn is
// untenable; a stable identity keeps the effect keyed to real data changes.
const NO_LOCATION_PINS: LocationRecordMapPinDto[] = [];

// One fixed color per LocationRecordKind — mirrors the palette the 2D map
// used, deliberately distinct from --color-primary/--color-client-* (account
// client-type pins use those), so an Office pin is never the same color as
// an account pin.
const LOCATION_KIND_COLOR_VAR: Record<string, string> = {
  Office: "--color-location-office",
  Event: "--color-location-event",
  Visit: "--color-location-visit",
  SignalLocation: "--color-text-muted",
  Other: "--color-text-faint",
};

// SignalLocation pins are auto-derived from signals and pile up densely in the
// same metros (mostly Sao Paulo), where they overlap into an unreadable cluster
// of pale dots. They are kept off the map; only hand-placed locations
// (Office/Event/Visit/Other) render. This is the filter for both the Cesium
// entities and the accessible pin list, so the two never disagree.
const MAP_HIDDEN_LOCATION_KINDS = new Set(["SignalLocation"]);

function isMappableLocationPin(pin: LocationRecordMapPinDto): boolean {
  return !MAP_HIDDEN_LOCATION_KINDS.has(pin.kind);
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

// Location pins hold one fixed screen-space pixel size regardless of camera
// distance — an earlier version shrank them toward a "precise anchor" as the
// camera got close, which made them unreadable up close.
const LOCATION_PIN_BASE_SIZE = 26;

const LOCATION_PIN_OUTLINE_WIDTH = 3;

// Location pins anchor with NONE, but at a position whose height was sampled
// from the terrain ONCE (see renderLocationPins) rather than at sea level. This
// is the middle path between the two failure modes on a 3D-terrain globe:
//   - NONE at height 0 keeps a fixed anchor but floats above elevated terrain,
//     so pins appear to drift across the map when the camera tilts.
//   - CLAMP_TO_GROUND sits on the terrain but re-samples height as tiles stream
//     in during a zoom, so pins jitter/pop.
// Baking the sampled height into a NONE anchor gives a pin that sits on the 3D
// surface at its own coordinate AND never moves once placed. disableDepthTest-
// Distance is POSITIVE_INFINITY on every pin, so they still draw on top.
const PIN_HEIGHT_REFERENCE = Cesium.HeightReference.NONE;

// "Feel alive": every location pin gently breathes (size oscillation) on a loop
// rather than sitting dead-still. Each pin gets a stable per-id phase offset
// (not random-per-render, not synced) so the whole map doesn't blink in unison
// like a single strobing light.
const AMBIENT_PULSE_AMPLITUDE = 0.12;
const AMBIENT_PULSE_PERIOD_MS = 2600;

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
// that positions (including terrain-clamped pins) stay numerically stable.
const MINIMUM_ZOOM_DISTANCE_METERS = 100;

// Nothing on this map is clustered. Cesium's EntityCluster was tried on the flat
// dots and removed; screen-space grouping was tried on the towers and removed
// too. Every account is its own pin (flat view) and its own tower (tower view),
// at every zoom. Accounts, locations and towers still each get their own
// DataSource so a rebuild of one layer never disturbs another — towers rebuild
// on every camera change, and they must not take the flat pins or location pins
// down with them.

const TOWER_TRANSITION_DURATION_MS = 550;

// Cesium fires camera.changed once the camera has moved by this fraction of
// the viewport. Towers are sized off camera altitude, so this is what makes
// them track a zoom. Small enough to read as continuous while dragging or
// zooming, large enough that we are not rebuilding extruded geometry on every
// single frame — per-frame primitive churn is what makes Cesium stutter.
const CAMERA_CHANGE_SENSITIVITY = 0.02;

const TOWER_LABEL_PIXEL_OFFSET = -8;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Six ground-level corners of a regular hexagon centered on `center`, in the local east-north-up frame so the shape sits flat on the earth's surface regardless of where on the globe it is. */
function hexagonPositions(center: Cesium.Cartesian3, radiusMeters: number): Cesium.Cartesian3[] {
  const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  const positions: Cesium.Cartesian3[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const local = new Cesium.Cartesian3(radiusMeters * Math.cos(angle), radiusMeters * Math.sin(angle), 0);
    positions.push(Cesium.Matrix4.multiplyByPoint(enuMatrix, local, new Cesium.Cartesian3()));
  }
  return positions;
}

export function CesiumGlobe({
  pins,
  locationPins = NO_LOCATION_PINS,
  selectedAccountId,
  viewMode,
  onSelectAccount,
  onSelectLocationPin,
}: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const towersDataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const locationsDataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const onSelectAccountRef = useRef(onSelectAccount);
  onSelectAccountRef.current = onSelectAccount;
  const onSelectLocationPinRef = useRef(onSelectLocationPin);
  onSelectLocationPinRef.current = onSelectLocationPin;
  const locationPinsRef = useRef(locationPins);
  locationPinsRef.current = locationPins;
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  // 0 = fully Flat, 1 = fully Tower — the single source of truth the render
  // effect animates every frame; viewMode only supplies the *target*.
  const progressRef = useRef(viewMode === "tower" ? 1 : 0);
  // Towers are sized against camera altitude, so the camera.changed listener
  // (registered once, on mount) has to be able to redraw them with the current
  // pins/selection/progress. It reaches the latest closure through this ref
  // rather than by re-subscribing on every data change.
  const renderTowersRef = useRef<(() => void) | null>(null);
  // World terrain streams in asynchronously after the viewer mounts. Location
  // pins sample terrain height to sit on the surface, so their render must wait
  // for this to resolve — otherwise the sample runs against the ellipsoid
  // placeholder, comes back at sea level, and the pins float and drift.
  const terrainReadyRef = useRef<Promise<Cesium.TerrainProvider> | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const token = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
    if (token) Cesium.Ion.defaultAccessToken = token;

    const worldTerrain = Cesium.Terrain.fromWorldTerrain();
    // Resolves with the real terrain provider once it has streamed in. Location
    // pins await this before sampling height (see terrainReadyRef / renderLocationPins).
    terrainReadyRef.current = new Promise<Cesium.TerrainProvider>((resolve) => {
      if (worldTerrain.ready) {
        resolve(worldTerrain.provider);
        return;
      }
      worldTerrain.readyEvent.addEventListener((provider) => resolve(provider));
    });

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

    const towersDataSource = new Cesium.CustomDataSource("towers");
    viewer.dataSources.add(towersDataSource);
    towersDataSourceRef.current = towersDataSource;

    const locationsDataSource = new Cesium.CustomDataSource("locations");
    viewer.dataSources.add(locationsDataSource);
    locationsDataSourceRef.current = locationsDataSource;

    // Towers are sized as a fraction of camera altitude, so a zoom has to
    // redraw them. camera.changed (throttled by percentageChanged) rather than
    // scene.postRender: rebuilding extruded polygon geometry every frame churns
    // primitives hard enough to stutter, and the eye cannot tell the difference.
    viewer.camera.percentageChanged = CAMERA_CHANGE_SENSITIVITY;
    viewer.camera.changed.addEventListener(() => renderTowersRef.current?.());

    viewer.screenSpaceEventHandler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(click.position);
      if (!picked) return;

      const properties = picked.id?.properties;

      const accountId = properties?.accountId?.getValue();
      if (accountId) {
        onSelectAccountRef.current?.(accountId);
        return;
      }
      const locationPinId = properties?.locationPinId?.getValue();
      if (locationPinId) {
        const pin = locationPinsRef.current.find((p) => p.id === locationPinId);
        if (pin) onSelectLocationPinRef.current?.(pin);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Hover tooltip — account name + open pipeline value, in either view mode.
    // Cesium's canvas has no native title/hover affordance of its own. Every
    // hoverable entity carries its own hoverName/hoverValue so a grouped tower
    // ("4 accounts", summed value) reads the same way a single one does.
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
      renderTowersRef.current = null;
      viewer.destroy();
      viewerRef.current = null;
      towersDataSourceRef.current = null;
      locationsDataSourceRef.current = null;
      terrainReadyRef.current = null;
    };
  }, []);

  // Location-record pins and value towers as Cesium entities, colored the same
  // as the rest of the dashboard.
  //
  // The flat view no longer draws account dots at all — accounts appear only as
  // towers (tower view). Flat view is location pins alone. Toggling to tower
  // grows the towers in; toggling back shrinks them out.
  useEffect(() => {
    const viewer = viewerRef.current;
    const towersDataSource = towersDataSourceRef.current;
    const locationsDataSource = locationsDataSourceRef.current;
    if (!viewer || !towersDataSource || !locationsDataSource) return;

    const surfaceColor = Cesium.Color.fromCssColorString(cssColorString("--color-surface"));
    const activeColor = Cesium.Color.fromCssColorString(cssColorString("--color-primary-active"));
    const stubColor = Cesium.Color.fromCssColorString(cssColorString("--color-text-faint"));
    const valueLowHex = cssColorString("--color-value-low");
    const valueMidHex = cssColorString("--color-value-mid");
    const valueHighHex = cssColorString("--color-value-high");

    function renderTowers(progress: number) {
      towersDataSource!.entities.removeAll();
      if (progress <= 0) return;

      // The single global scale factor, shared by every tower drawn this pass —
      // this is what keeps heights comparable across the screen.
      const scaleAltitude = towerScaleAltitudeMeters(viewer!.camera.positionCartographic.height);
      const radius = towerRadiusMeters(scaleAltitude);

      for (const pin of pins) {
        const hasValue = pin.openPipelineValue > 0;
        const selected = pin.id === selectedAccountId;
        const position = Cesium.Cartesian3.fromDegrees(pin.coordinate.longitude, pin.coordinate.latitude);

        const fullHeight = hasValue
          ? valueToTowerHeightMeters(pin.openPipelineValue, scaleAltitude)
          : stubTowerHeightMeters(scaleAltitude);
        const height = Math.max(1, fullHeight * progress);
        const material = hasValue
          ? Cesium.Color.fromCssColorString(valueColorHex(valueLowHex, valueMidHex, valueHighHex, valueToScaleT(pin.openPipelineValue)))
          : stubColor;
        const id = `tower-${pin.id}`;

        towersDataSource!.entities.add({
          id,
          position,
          properties: {
            accountId: pin.id,
            hoverName: pin.name,
            hoverValue: pin.openPipelineValue,
          },
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(hexagonPositions(position, radius)),
            height: 0,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            extrudedHeight: height,
            extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            material: material.withAlpha(progress),
            outline: true,
            outlineColor: (selected ? activeColor : surfaceColor).withAlpha(progress),
            outlineWidth: selected ? 3 : 1,
          },
        });

        // Selection indicator for a settled tower — a pulsing ring at its
        // ground anchor, not an outline change (color/height already carry the
        // value encoding). Sized off the same camera-derived radius, so it
        // tracks the tower it belongs to through a zoom.
        if (selected && progress >= 1) {
          const ringRadius = new Cesium.CallbackProperty(
            () => radius * (1.3 + 0.25 * Math.sin(performance.now() / 350)),
            false,
          );
          towersDataSource!.entities.add({
            id: `${id}-ring`,
            position,
            ellipse: {
              semiMinorAxis: ringRadius,
              semiMajorAxis: ringRadius,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              material: activeColor.withAlpha(0.35),
              outline: true,
              outlineColor: activeColor,
              outlineWidth: 2,
            },
          });
        }
      }
    }

    async function renderLocationPins() {
      locationsDataSource!.entities.removeAll();
      const mappable = locationPins.filter(isMappableLocationPin);
      if (mappable.length === 0) return;

      // Sample each pin's terrain height ONCE, bake it into a fixed position, and
      // anchor with HeightReference.NONE (see PIN_HEIGHT_REFERENCE). This lands
      // the dot on the 3D terrain surface at its own coordinate — so it neither
      // floats at sea level and drifts when the camera tilts, nor re-samples per
      // frame and jitters as terrain tiles stream in.
      const cartographics = mappable.map((pin) =>
        Cesium.Cartographic.fromDegrees(pin.coordinate.longitude, pin.coordinate.latitude),
      );
      try {
        // Wait for world terrain to finish streaming in before sampling, so the
        // heights are real ground elevations rather than the ellipsoid placeholder's 0.
        const terrainProvider = await terrainReadyRef.current;
        if (cancelled) return;
        if (terrainProvider) await Cesium.sampleTerrainMostDetailed(terrainProvider, cartographics);
      } catch {
        // Terrain unavailable: the sampled heights stay 0, so the pins simply
        // sit on the ellipsoid this pass.
      }
      // The effect may have been torn down (or re-run with new data) while we
      // were awaiting the async terrain sample — don't populate a stale layer.
      if (cancelled) return;

      mappable.forEach((pin, index) => {
        const carto = cartographics[index];
        if (!carto) return;
        const fillColor = Cesium.Color.fromCssColorString(cssColorString(LOCATION_KIND_COLOR_VAR[pin.kind] ?? "--color-text-faint"));
        const phase = stablePhase(pin.id);

        locationsDataSource!.entities.add({
          id: `location-pin-${pin.id}`,
          position: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height),
          properties: { locationPinId: pin.id },
          point: {
            pixelSize: new Cesium.CallbackProperty(
              () => LOCATION_PIN_BASE_SIZE * pulseFactor(Date.now(), AMBIENT_PULSE_AMPLITUDE, AMBIENT_PULSE_PERIOD_MS, phase),
              false,
            ),
            color: fillColor.withAlpha(pin.reviewStatus === "ReviewRequired" ? 0.6 : 1),
            outlineColor: surfaceColor,
            outlineWidth: LOCATION_PIN_OUTLINE_WIDTH,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            heightReference: PIN_HEIGHT_REFERENCE,
          },
        });
      });
    }

    // Set true by the cleanup so the async terrain sample in renderLocationPins
    // knows not to populate a torn-down or superseded layer.
    let cancelled = false;
    let animationFrame: number | null = null;

    // The camera listener redraws towers alone — location pins are
    // camera-independent, and rebuilding them on every zoom tick would reset
    // their pulse for no reason.
    renderTowersRef.current = () => renderTowers(progressRef.current);

    void renderLocationPins();

    const startProgress = progressRef.current;
    const targetProgress = viewMode === "tower" ? 1 : 0;

    // Skip the RAF loop entirely when there's nothing to animate (the common
    // case — most renders aren't a flat/tower transition). Running it
    // unconditionally rebuilt every tower from scratch on every frame for 550ms
    // even when startProgress === targetProgress, which read as flickering.
    if (startProgress === targetProgress) {
      renderTowers(startProgress);
    } else {
      const startTime = performance.now();

      const tick = (now: number) => {
        const linear = Math.min(1, (now - startTime) / TOWER_TRANSITION_DURATION_MS);
        const value = startProgress + (targetProgress - startProgress) * easeOutCubic(linear);
        progressRef.current = value;
        renderTowers(value);
        if (linear < 1) {
          animationFrame = requestAnimationFrame(tick);
        }
      };
      animationFrame = requestAnimationFrame(tick);
    }

    return () => {
      cancelled = true;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    };
  }, [pins, locationPins, selectedAccountId, viewMode]);

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
          mirror each pin's click behavior. */}
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
        {locationPins.filter(isMappableLocationPin).map((pin) => (
          <button
            key={pin.id}
            type="button"
            className="cesium-globe__a11y-pin"
            aria-label={`${pin.label} (${pin.kind})`}
            onClick={() => onSelectLocationPin?.(pin)}
          >
            {pin.label}
          </button>
        ))}
      </div>
    </div>
  );
}
