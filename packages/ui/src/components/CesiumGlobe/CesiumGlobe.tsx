import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { AccountMapPinDto, LocationRecordMapPinDto } from "@pulse-brazil/application";
import { clientTypeColorVar, primaryClientType } from "../../utils/clientType";
import { formatCurrency } from "../../utils/formatNumbers";
import { valueColorHex, valueToScaleT, valueToTowerHeightMeters } from "../../utils/pipelineValueScale";
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

// Pins are the main thing on this page, at every zoom level — an earlier
// version shrank them toward a "precise anchor" as the camera got close,
// which made them unreadable up close (the opposite of the goal). Pins now
// hold one fixed screen-space pixel size regardless of camera distance.
const ACCOUNT_PIN_BASE_SIZE = 40;
const ACCOUNT_PIN_SELECTED_BASE_SIZE = 52;
const LOCATION_PIN_BASE_SIZE = 26;

const ACCOUNT_PIN_OUTLINE_WIDTH = 3;
const ACCOUNT_PIN_SELECTED_OUTLINE_WIDTH = 4;
const LOCATION_PIN_OUTLINE_WIDTH = 3;

// "Feel alive": every pin gently breathes (size oscillation) on a loop
// rather than sitting dead-still. The selected pin pulses harder/faster so
// it still reads as distinct now that pulsing isn't unique to it. Each pin
// gets a stable per-id phase offset (not random-per-render, not synced)
// so the whole map doesn't blink in unison like a single strobing light.
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
// that positions (including terrain-clamped pins) stay numerically stable.
const MINIMUM_ZOOM_DISTANCE_METERS = 100;

// Account pins live in their own clustered DataSource (Cesium only clusters
// entities added this way, not viewer.entities directly) so dense areas
// collapse into a countable bubble instead of an unreadable pile of
// overlapping pins. Location pins are the secondary layer and stay
// uncluttered individual pins on viewer.entities. Tower-view polygons also
// live directly on viewer.entities — Cesium's clustering only operates on
// point/billboard/label graphics, not polygons, and with 44 real accounts
// total there's no dense-overlap problem for towers to solve.
const CLUSTER_PIXEL_RANGE = 60;
const CLUSTER_MINIMUM_SIZE = 2;
const CLUSTER_PIN_BASE_SIZE = 46;
const CLUSTER_PIN_OUTLINE_WIDTH = 4;
// Floor on the fit-to-cluster rectangle so clicking a cluster of pins that
// share (almost) the same coordinate still visibly zooms in, rather than
// flying to a degenerate zero-size rectangle.
const CLUSTER_ZOOM_PADDING_RADIANS = 0.002;

// Tower view geometry. Footprint radius is deliberately fixed regardless of
// value — only height and color encode the deal size, per the "not larger
// circles" decision. A stylized, exaggerated scale (like any spike-map
// convention): real deal values would be an invisible bump at this radius.
const TOWER_HEX_RADIUS_METERS = 12_000;
const TOWER_TRANSITION_DURATION_MS = 550;

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

function rectangleForEntities(viewer: Cesium.Viewer, entities: Cesium.Entity[]): Cesium.Rectangle | null {
  const time = viewer.clock.currentTime;
  const cartographics = entities
    .map((entity) => entity.position?.getValue(time))
    .filter((position): position is Cesium.Cartesian3 => !!position)
    .map((position) => Cesium.Cartographic.fromCartesian(position));
  if (cartographics.length === 0) return null;

  let west = Math.min(...cartographics.map((c) => c.longitude));
  let east = Math.max(...cartographics.map((c) => c.longitude));
  let south = Math.min(...cartographics.map((c) => c.latitude));
  let north = Math.max(...cartographics.map((c) => c.latitude));

  if (east - west < CLUSTER_ZOOM_PADDING_RADIANS) {
    const centerLongitude = (east + west) / 2;
    west = centerLongitude - CLUSTER_ZOOM_PADDING_RADIANS / 2;
    east = centerLongitude + CLUSTER_ZOOM_PADDING_RADIANS / 2;
  }
  if (north - south < CLUSTER_ZOOM_PADDING_RADIANS) {
    const centerLatitude = (north + south) / 2;
    south = centerLatitude - CLUSTER_ZOOM_PADDING_RADIANS / 2;
    north = centerLatitude + CLUSTER_ZOOM_PADDING_RADIANS / 2;
  }
  return new Cesium.Rectangle(west, south, east, north);
}

export function CesiumGlobe({
  pins,
  locationPins = [],
  selectedAccountId,
  viewMode,
  onSelectAccount,
  onSelectLocationPin,
}: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const accountsDataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const clusterPulseTargetsRef = useRef<Set<Cesium.PointPrimitive>>(new Set());
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
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

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
    accountsDataSource.clustering.enabled = true;
    accountsDataSource.clustering.pixelRange = CLUSTER_PIXEL_RANGE;
    accountsDataSource.clustering.minimumClusterSize = CLUSTER_MINIMUM_SIZE;
    accountsDataSource.clustering.clusterEvent.addEventListener((clusteredEntities, cluster) => {
      cluster.billboard.show = false;

      const colorVarCounts = new Map<string, number>();
      for (const entity of clusteredEntities) {
        const colorVar = entity.properties?.clientTypeColorVar?.getValue();
        if (colorVar) colorVarCounts.set(colorVar, (colorVarCounts.get(colorVar) ?? 0) + 1);
      }
      let dominantColorVar = "--color-text-faint";
      let dominantCount = 0;
      for (const [colorVar, count] of colorVarCounts) {
        if (count > dominantCount) {
          dominantColorVar = colorVar;
          dominantCount = count;
        }
      }

      cluster.point.show = true;
      cluster.point.pixelSize = CLUSTER_PIN_BASE_SIZE;
      cluster.point.color = Cesium.Color.fromCssColorString(cssColorString("--color-text"));
      cluster.point.outlineColor = Cesium.Color.fromCssColorString(cssColorString(dominantColorVar));
      cluster.point.outlineWidth = CLUSTER_PIN_OUTLINE_WIDTH;
      cluster.point.disableDepthTestDistance = Number.POSITIVE_INFINITY;
      clusterPulseTargetsRef.current.add(cluster.point);

      cluster.label.show = true;
      cluster.label.text = clusteredEntities.length.toLocaleString();
      cluster.label.font = "bold 14px 'DM Sans', sans-serif";
      cluster.label.fillColor = Cesium.Color.fromCssColorString(cssColorString("--color-surface"));
      cluster.label.style = Cesium.LabelStyle.FILL;
      cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
      cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
      cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
    });
    viewer.dataSources.add(accountsDataSource);
    accountsDataSourceRef.current = accountsDataSource;

    // Cluster point primitives aren't entity Properties, so they can't use
    // CallbackProperty — pulse them by hand on every render frame instead.
    // Stale references (from clusters that have since been recomposed) are
    // harmless no-ops here, and the set is cleared whenever pins data
    // changes, so it never grows without bound.
    viewer.scene.postRender.addEventListener(() => {
      const factor = pulseFactor(Date.now(), AMBIENT_PULSE_AMPLITUDE, AMBIENT_PULSE_PERIOD_MS, 0);
      for (const point of clusterPulseTargetsRef.current) {
        point.pixelSize = CLUSTER_PIN_BASE_SIZE * factor;
      }
    });

    viewer.screenSpaceEventHandler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(click.position);
      if (!picked) return;

      // Clustered entities are picked as an array of the member Entities
      // rather than a single one — clicking a cluster zooms in to fit its
      // members, which pushes them past the cluster pixel range and breaks
      // it apart.
      if (Array.isArray(picked.id)) {
        const rectangle = rectangleForEntities(viewer, picked.id as Cesium.Entity[]);
        if (rectangle) viewer.camera.flyTo({ destination: rectangle, duration: 0.8 });
        return;
      }

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

    // Hover tooltip — account name + open pipeline value, in either view
    // mode. Cesium's canvas has no native title/hover affordance of its own.
    viewer.screenSpaceEventHandler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      const picked = viewer.scene.pick(movement.endPosition);
      const accountId = !Array.isArray(picked?.id) ? picked?.id?.properties?.accountId?.getValue() : undefined;
      if (accountId) {
        const pin = pinsRef.current.find((p) => p.id === accountId);
        if (pin) {
          setHoverInfo({ name: pin.name, value: pin.openPipelineValue, x: movement.endPosition.x, y: movement.endPosition.y });
          return;
        }
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
      clusterPulseTargetsRef.current.clear();
    };
  }, []);

  // Account + location-record pins as Cesium entities, colored the same as
  // the rest of the dashboard. Account pins go into the clustered accounts
  // DataSource (Flat view, and any zero-pipeline account regardless of
  // mode); location pins and Tower-view polygons stay directly on
  // viewer.entities and never cluster. Switching modes animates every
  // account's tower height between the two states in lockstep (progressRef)
  // rather than snapping instantly, fading the flat dot out as its tower
  // fades/grows in (and back on the return trip).
  useEffect(() => {
    const viewer = viewerRef.current;
    const accountsDataSource = accountsDataSourceRef.current;
    if (!viewer || !accountsDataSource) return;

    const surfaceColor = Cesium.Color.fromCssColorString(cssColorString("--color-surface"));
    const activeColor = Cesium.Color.fromCssColorString(cssColorString("--color-primary-active"));
    const valueLowHex = cssColorString("--color-value-low");
    const valueMidHex = cssColorString("--color-value-mid");
    const valueHighHex = cssColorString("--color-value-high");
    const valueLowColor = Cesium.Color.fromCssColorString(valueLowHex);

    function renderEntities(progress: number) {
      accountsDataSource!.entities.removeAll();
      viewer!.entities.removeAll();
      clusterPulseTargetsRef.current.clear();

      for (const pin of pins) {
        const colorVar = clientTypeColorVar(primaryClientType(pin.clientTypes));
        const clientColor = Cesium.Color.fromCssColorString(cssColorString(colorVar));
        const selected = pin.id === selectedAccountId;
        const phase = stablePhase(pin.id);
        const position = Cesium.Cartesian3.fromDegrees(pin.coordinate.longitude, pin.coordinate.latitude);
        const hasValue = pin.openPipelineValue > 0;

        // The flat dot: always present (and clustered/pulsing) for
        // zero-pipeline accounts — a minimal marker, never a tower. For
        // accounts with value it fades out as the tower fades/grows in, in
        // either direction of travel.
        const showDot = !hasValue || progress < 1;
        if (showDot) {
          const dotAlpha = hasValue ? Math.max(0, 1 - progress) : 1;
          const dotColor = !hasValue && progress > 0 ? valueLowColor : clientColor;
          const baseSize = selected ? ACCOUNT_PIN_SELECTED_BASE_SIZE : ACCOUNT_PIN_BASE_SIZE;
          const amplitude = selected ? SELECTED_PULSE_AMPLITUDE : AMBIENT_PULSE_AMPLITUDE;
          const periodMs = selected ? SELECTED_PULSE_PERIOD_MS : AMBIENT_PULSE_PERIOD_MS;

          accountsDataSource!.entities.add({
            id: `account-pin-${pin.id}`,
            position,
            properties: { accountId: pin.id, clientTypeColorVar: colorVar },
            point: {
              pixelSize: new Cesium.CallbackProperty(() => baseSize * pulseFactor(Date.now(), amplitude, periodMs, phase), false),
              color: dotColor.withAlpha(dotAlpha),
              outlineColor: selected ? activeColor : surfaceColor,
              outlineWidth: selected ? ACCOUNT_PIN_SELECTED_OUTLINE_WIDTH : ACCOUNT_PIN_OUTLINE_WIDTH,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
        }

        if (hasValue && progress > 0) {
          const growAlpha = Math.min(1, progress);
          const height = Math.max(1, valueToTowerHeightMeters(pin.openPipelineValue) * progress);
          const fillHex = valueColorHex(valueLowHex, valueMidHex, valueHighHex, valueToScaleT(pin.openPipelineValue));
          const outlineColor = selected ? activeColor : surfaceColor;

          viewer!.entities.add({
            id: `account-tower-${pin.id}`,
            position,
            properties: { accountId: pin.id },
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(hexagonPositions(position, TOWER_HEX_RADIUS_METERS)),
              height: 0,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              extrudedHeight: height,
              extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
              material: Cesium.Color.fromCssColorString(fillHex).withAlpha(growAlpha),
              outline: true,
              outlineColor: outlineColor.withAlpha(growAlpha),
              outlineWidth: selected ? 3 : 1,
            },
          });

          // Selection indicator for a settled tower — a pulsing ring at its
          // ground anchor, not an outline change (color/height already
          // carry the value encoding).
          if (selected && progress >= 1) {
            viewer!.entities.add({
              id: `account-tower-ring-${pin.id}`,
              position,
              ellipse: {
                semiMinorAxis: new Cesium.CallbackProperty(
                  () => TOWER_HEX_RADIUS_METERS * (1.3 + 0.25 * Math.sin(performance.now() / 350)),
                  false,
                ),
                semiMajorAxis: new Cesium.CallbackProperty(
                  () => TOWER_HEX_RADIUS_METERS * (1.3 + 0.25 * Math.sin(performance.now() / 350)),
                  false,
                ),
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

      for (const pin of locationPins) {
        const fillColor = Cesium.Color.fromCssColorString(cssColorString(LOCATION_KIND_COLOR_VAR[pin.kind] ?? "--color-text-faint"));
        const phase = stablePhase(pin.id);

        viewer!.entities.add({
          id: `location-pin-${pin.id}`,
          position: Cesium.Cartesian3.fromDegrees(pin.coordinate.longitude, pin.coordinate.latitude),
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
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        });
      }
    }

    const startProgress = progressRef.current;
    const targetProgress = viewMode === "tower" ? 1 : 0;

    // Skip the RAF loop entirely when there's nothing to animate (the
    // common case — most renders aren't a flat/tower transition). Running
    // it unconditionally rebuilt every entity from scratch on every frame
    // for 550ms even when startProgress === targetProgress, which fought
    // with clustering's own recompute-on-change and read as pins
    // flickering color/size/position off their anchors.
    if (startProgress === targetProgress) {
      renderEntities(startProgress);
      return;
    }

    const startTime = performance.now();
    let animationFrame: number | null = null;

    function tick(now: number) {
      const linear = Math.min(1, (now - startTime) / TOWER_TRANSITION_DURATION_MS);
      const eased = easeOutCubic(linear);
      const value = startProgress + (targetProgress - startProgress) * eased;
      progressRef.current = value;
      renderEntities(value);
      if (linear < 1) {
        animationFrame = requestAnimationFrame(tick);
      }
    }
    animationFrame = requestAnimationFrame(tick);

    return () => {
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
        {locationPins.map((pin) => (
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
