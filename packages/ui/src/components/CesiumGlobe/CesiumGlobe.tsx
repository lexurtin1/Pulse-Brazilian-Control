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

// Pins read as large, countable landmarks from a whole-Brazil-or-further
// view, then retreat down to a small, precise marker as you zoom into a
// city/account so they lock onto their real anchor instead of dominating
// the close-up view. One shared curve (a multiplier on each entity's own
// base pixelSize) rather than per-kind constants, so account and location
// pins shrink at the same rate and stay proportionate to each other at any
// zoom. The near bound is building-block scale (not the old 50km, which
// hit its floor long before anything resembling a close-up) so pins keep
// visibly shrinking all the way down to the locked-in city view.
const PIN_SCALE_NEAR_DISTANCE_METERS = 300;
const PIN_SCALE_NEAR_FACTOR = 0.3;
const PIN_SCALE_FAR_DISTANCE_METERS = 2_000_000;
const PIN_SCALE_FAR_FACTOR = 1.0;
const PIN_SCALE_BY_DISTANCE = new Cesium.NearFarScalar(
  PIN_SCALE_NEAR_DISTANCE_METERS,
  PIN_SCALE_NEAR_FACTOR,
  PIN_SCALE_FAR_DISTANCE_METERS,
  PIN_SCALE_FAR_FACTOR,
);

const ACCOUNT_PIN_BASE_SIZE = 28;
const ACCOUNT_PIN_SELECTED_BASE_SIZE = 34;
const LOCATION_PIN_BASE_SIZE = 22;

// Cesium's zoom-in floor defaults to 1m from the ellipsoid, which is far
// past the point where camera-relative floating-point precision breaks
// down — that precision loss is what reads as pins "drifting" off their
// anchor at max zoom. Flooring the zoom keeps the camera far enough out
// that positions (including terrain-clamped pins) stay numerically stable.
const MINIMUM_ZOOM_DISTANCE_METERS = 100;

export function CesiumGlobe({ pins, locationPins = [], selectedAccountId, onSelectAccount, onSelectLocationPin }: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
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

    viewer.screenSpaceEventHandler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(click.position);
      const properties = picked?.id?.properties;
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
    };
  }, []);

  // Account + location-record pins as Cesium point Entities, colored the
  // same as the rest of the dashboard. scaleByDistance makes every pin read
  // as a large landmark zoomed out and shrink down on approach.
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
          pixelSize: selected ? ACCOUNT_PIN_SELECTED_BASE_SIZE : ACCOUNT_PIN_BASE_SIZE,
          color: fillColor,
          outlineColor: selected ? activeColor : surfaceColor,
          outlineWidth: selected ? 3 : 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: PIN_SCALE_BY_DISTANCE,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
    }

    for (const pin of locationPins) {
      const fillColor = Cesium.Color.fromCssColorString(cssColorString(LOCATION_KIND_COLOR_VAR[pin.kind] ?? "--color-text-faint"));

      viewer.entities.add({
        id: `location-pin-${pin.id}`,
        position: Cesium.Cartesian3.fromDegrees(pin.coordinate.longitude, pin.coordinate.latitude),
        properties: { locationPinId: pin.id },
        point: {
          pixelSize: LOCATION_PIN_BASE_SIZE,
          color: fillColor.withAlpha(pin.reviewStatus === "ReviewRequired" ? 0.6 : 1),
          outlineColor: surfaceColor,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: PIN_SCALE_BY_DISTANCE,
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
