import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { AccountMapPinDto, LocationRecordMapPinDto } from "@pulse-brazil/application";
import { clientTypeColorVar, primaryClientType } from "../../utils/clientType";
import "./CesiumGlobe.css";

interface CesiumGlobeProps {
  pins: AccountMapPinDto[];
  locationPins?: LocationRecordMapPinDto[];
  selectedAccountId: string | null;
  onSelectAccount?: (accountId: string) => void;
  onSelectLocationPin?: (pin: LocationRecordMapPinDto) => void;
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
// uncluttered individual pins on viewer.entities.
const CLUSTER_PIXEL_RANGE = 60;
const CLUSTER_MINIMUM_SIZE = 2;
const CLUSTER_PIN_BASE_SIZE = 46;
const CLUSTER_PIN_OUTLINE_WIDTH = 4;
// Floor on the fit-to-cluster rectangle so clicking a cluster of pins that
// share (almost) the same coordinate still visibly zooms in, rather than
// flying to a degenerate zero-size rectangle.
const CLUSTER_ZOOM_PADDING_RADIANS = 0.002;

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

export function CesiumGlobe({ pins, locationPins = [], selectedAccountId, onSelectAccount, onSelectLocationPin }: CesiumGlobeProps) {
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

  // Account + location-record pins as Cesium point Entities, colored the
  // same as the rest of the dashboard. Account pins go into the clustered
  // accounts DataSource; location pins stay directly on viewer.entities and
  // never cluster. Every pin holds a fixed pixelSize (no distance scaling)
  // and pulses continuously via a time-based CallbackProperty.
  useEffect(() => {
    const viewer = viewerRef.current;
    const accountsDataSource = accountsDataSourceRef.current;
    if (!viewer || !accountsDataSource) return;

    accountsDataSource.entities.removeAll();
    viewer.entities.removeAll();
    clusterPulseTargetsRef.current.clear();

    const surfaceColor = Cesium.Color.fromCssColorString(cssColorString("--color-surface"));
    const activeColor = Cesium.Color.fromCssColorString(cssColorString("--color-primary-active"));

    for (const pin of pins) {
      const colorVar = clientTypeColorVar(primaryClientType(pin.clientTypes));
      const fillColor = Cesium.Color.fromCssColorString(cssColorString(colorVar));
      const selected = pin.id === selectedAccountId;
      const phase = stablePhase(pin.id);
      const baseSize = selected ? ACCOUNT_PIN_SELECTED_BASE_SIZE : ACCOUNT_PIN_BASE_SIZE;
      const amplitude = selected ? SELECTED_PULSE_AMPLITUDE : AMBIENT_PULSE_AMPLITUDE;
      const periodMs = selected ? SELECTED_PULSE_PERIOD_MS : AMBIENT_PULSE_PERIOD_MS;

      accountsDataSource.entities.add({
        id: `account-pin-${pin.id}`,
        position: Cesium.Cartesian3.fromDegrees(pin.coordinate.longitude, pin.coordinate.latitude),
        properties: { accountId: pin.id, clientTypeColorVar: colorVar },
        point: {
          pixelSize: new Cesium.CallbackProperty(() => baseSize * pulseFactor(Date.now(), amplitude, periodMs, phase), false),
          color: fillColor,
          outlineColor: selected ? activeColor : surfaceColor,
          outlineWidth: selected ? ACCOUNT_PIN_SELECTED_OUTLINE_WIDTH : ACCOUNT_PIN_OUTLINE_WIDTH,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
    }

    for (const pin of locationPins) {
      const fillColor = Cesium.Color.fromCssColorString(cssColorString(LOCATION_KIND_COLOR_VAR[pin.kind] ?? "--color-text-faint"));
      const phase = stablePhase(pin.id);

      viewer.entities.add({
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
  }, [pins, locationPins, selectedAccountId]);

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
