import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { AccountMapPinDto, LocationRecordMapPinDto } from "@pulse-brazil/application";
import { clientTypeColorVar, primaryClientType } from "../../utils/clientType";
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

// Flat account pins are NOT clustered. Cesium's EntityCluster was tried here
// and removed: it recomputes on every camera tick, tearing down and rebuilding
// its whole primitive pool each time, which fought the pins' own pulse and
// selection rendering and left dots flickering, stranded, and mis-picked. Every
// account is now simply its own pin at every zoom. Accounts, locations and
// towers still each get their own DataSource so a rebuild of one layer never
// disturbs another — towers rebuild on every camera change, and they must not
// take the flat pins or location pins down with them.

// Screen-space grouping range for TOWERS only (see groupPinsByScreenProximity).
// Unrelated to the deleted dot clustering — towers are polygons, which Cesium's
// clustering cannot touch at all, so their grouping is ours and is recomputed
// only when the camera changes.
const TOWER_GROUP_PIXEL_RANGE = 60;
// Floor on the fit-to-group rectangle so clicking a tower whose members share
// (almost) the same coordinate still visibly zooms in, rather than flying to a
// degenerate zero-size rectangle.
const TOWER_GROUP_ZOOM_PADDING_RADIANS = 0.002;

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

/** Bounding rectangle over raw lon/lat degrees, floored so a group whose members share (almost) one coordinate still zooms somewhere. */
function rectangleForCoordinates(coordinates: { longitude: number; latitude: number }[]): Cesium.Rectangle | null {
  if (coordinates.length === 0) return null;

  let { west, east, south, north } = Cesium.Rectangle.fromDegrees(
    Math.min(...coordinates.map((c) => c.longitude)),
    Math.min(...coordinates.map((c) => c.latitude)),
    Math.max(...coordinates.map((c) => c.longitude)),
    Math.max(...coordinates.map((c) => c.latitude)),
  );

  if (east - west < TOWER_GROUP_ZOOM_PADDING_RADIANS) {
    const centerLongitude = (east + west) / 2;
    west = centerLongitude - TOWER_GROUP_ZOOM_PADDING_RADIANS / 2;
    east = centerLongitude + TOWER_GROUP_ZOOM_PADDING_RADIANS / 2;
  }
  if (north - south < TOWER_GROUP_ZOOM_PADDING_RADIANS) {
    const centerLatitude = (north + south) / 2;
    south = centerLatitude - TOWER_GROUP_ZOOM_PADDING_RADIANS / 2;
    north = centerLatitude + TOWER_GROUP_ZOOM_PADDING_RADIANS / 2;
  }
  return new Cesium.Rectangle(west, south, east, north);
}

interface TowerGroup {
  members: AccountMapPinDto[];
  longitude: number;
  latitude: number;
  totalValue: number;
}

/**
 * Screen-space grouping of account pins for Tower view.
 *
 * Towers are extruded polygons, and Cesium's clustering only ever operated on
 * point/billboard/label graphics — so towers could never have been clustered by
 * Cesium even when the flat pins were. Without this, every account within ~2x
 * the tower radius of another (i.e. most of Sao Paulo) was a permanently
 * overlapping pile at wide zoom. Grouping in screen space rather than by
 * geographic distance is what makes a group dissolve as you fly in: the same two
 * accounts are 60px apart at country zoom and half a screen apart over the city.
 *
 * This is ours, recomputed only on camera change, and shares nothing with the
 * Cesium EntityCluster that used to run on the flat pins.
 */
function groupPinsByScreenProximity(viewer: Cesium.Viewer, pins: AccountMapPinDto[]): TowerGroup[] {
  const groups: (TowerGroup & { screenX: number; screenY: number })[] = [];

  for (const pin of pins) {
    const world = Cesium.Cartesian3.fromDegrees(pin.coordinate.longitude, pin.coordinate.latitude);
    const screen = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, world);

    // Behind the globe / off-screen: no meaningful screen position to group by,
    // so it stands alone. It is occluded anyway.
    if (!screen) {
      groups.push({
        members: [pin],
        longitude: pin.coordinate.longitude,
        latitude: pin.coordinate.latitude,
        totalValue: pin.openPipelineValue,
        screenX: Number.POSITIVE_INFINITY,
        screenY: Number.POSITIVE_INFINITY,
      });
      continue;
    }

    const existing = groups.find(
      (group) => Math.hypot(group.screenX - screen.x, group.screenY - screen.y) <= TOWER_GROUP_PIXEL_RANGE,
    );
    if (existing) {
      const count = existing.members.length;
      existing.members.push(pin);
      existing.totalValue += pin.openPipelineValue;
      // Running mean, so a group's anchor is the centroid of its members
      // rather than wherever its first member happened to be.
      existing.longitude = (existing.longitude * count + pin.coordinate.longitude) / (count + 1);
      existing.latitude = (existing.latitude * count + pin.coordinate.latitude) / (count + 1);
      existing.screenX = (existing.screenX * count + screen.x) / (count + 1);
      existing.screenY = (existing.screenY * count + screen.y) / (count + 1);
      continue;
    }

    groups.push({
      members: [pin],
      longitude: pin.coordinate.longitude,
      latitude: pin.coordinate.latitude,
      totalValue: pin.openPipelineValue,
      screenX: screen.x,
      screenY: screen.y,
    });
  }

  return groups;
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
  const accountsDataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
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

    // Clustering is deliberately left off: every account is its own pin, at
    // every zoom. See the note by TOWER_GROUP_PIXEL_RANGE.
    const accountsDataSource = new Cesium.CustomDataSource("accounts");
    viewer.dataSources.add(accountsDataSource);
    accountsDataSourceRef.current = accountsDataSource;

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

      // A grouped tower carries its members' ids instead of a single account.
      // Clicking it flies to fit the members, which pulls them apart on screen
      // and so dissolves the group.
      const memberAccountIds = properties?.memberAccountIds?.getValue() as string[] | undefined;
      if (memberAccountIds && memberAccountIds.length > 1) {
        const memberPins = pinsRef.current.filter((pin) => memberAccountIds.includes(pin.id));
        const rectangle = rectangleForCoordinates(memberPins.map((pin) => pin.coordinate));
        if (rectangle) viewer.camera.flyTo({ destination: rectangle, duration: 0.8 });
        return;
      }

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
      accountsDataSourceRef.current = null;
      towersDataSourceRef.current = null;
      locationsDataSourceRef.current = null;
    };
  }, []);

  // Account + location-record pins as Cesium entities, colored the same as the
  // rest of the dashboard.
  //
  // Flat view is one dot per account — no clustering, no bubbles. Tower view is
  // towers and NOTHING else: an account with no open pipeline is a short grey
  // stub tower, not a leftover flat dot, so there is never a dot on screen once
  // the transition settles. Switching modes animates the two layers past each
  // other in lockstep on progressRef (dots fading out as towers grow in, and the
  // reverse on the way back) rather than snapping.
  useEffect(() => {
    const viewer = viewerRef.current;
    const accountsDataSource = accountsDataSourceRef.current;
    const towersDataSource = towersDataSourceRef.current;
    const locationsDataSource = locationsDataSourceRef.current;
    if (!viewer || !accountsDataSource || !towersDataSource || !locationsDataSource) return;

    const surfaceColor = Cesium.Color.fromCssColorString(cssColorString("--color-surface"));
    const activeColor = Cesium.Color.fromCssColorString(cssColorString("--color-primary-active"));
    const stubColor = Cesium.Color.fromCssColorString(cssColorString("--color-text-faint"));
    const valueLowHex = cssColorString("--color-value-low");
    const valueMidHex = cssColorString("--color-value-mid");
    const valueHighHex = cssColorString("--color-value-high");

    function renderDots(progress: number) {
      accountsDataSource!.entities.removeAll();
      if (progress >= 1) return;

      const alpha = 1 - progress;
      for (const pin of pins) {
        const clientColor = Cesium.Color.fromCssColorString(cssColorString(clientTypeColorVar(primaryClientType(pin.clientTypes))));
        const selected = pin.id === selectedAccountId;
        const phase = stablePhase(pin.id);
        const baseSize = selected ? ACCOUNT_PIN_SELECTED_BASE_SIZE : ACCOUNT_PIN_BASE_SIZE;
        const amplitude = selected ? SELECTED_PULSE_AMPLITUDE : AMBIENT_PULSE_AMPLITUDE;
        const periodMs = selected ? SELECTED_PULSE_PERIOD_MS : AMBIENT_PULSE_PERIOD_MS;

        accountsDataSource!.entities.add({
          id: `account-pin-${pin.id}`,
          position: Cesium.Cartesian3.fromDegrees(pin.coordinate.longitude, pin.coordinate.latitude),
          properties: {
            accountId: pin.id,
            hoverName: pin.name,
            hoverValue: pin.openPipelineValue,
          },
          point: {
            pixelSize: new Cesium.CallbackProperty(() => baseSize * pulseFactor(Date.now(), amplitude, periodMs, phase), false),
            color: clientColor.withAlpha(alpha),
            outlineColor: (selected ? activeColor : surfaceColor).withAlpha(alpha),
            outlineWidth: selected ? ACCOUNT_PIN_SELECTED_OUTLINE_WIDTH : ACCOUNT_PIN_OUTLINE_WIDTH,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        });
      }
    }

    function renderTowers(progress: number) {
      towersDataSource!.entities.removeAll();
      if (progress <= 0) return;

      // The single global scale factor, shared by every tower drawn this pass —
      // this is what keeps heights comparable across the screen.
      const scaleAltitude = towerScaleAltitudeMeters(viewer!.camera.positionCartographic.height);
      const radius = towerRadiusMeters(scaleAltitude);

      for (const group of groupPinsByScreenProximity(viewer!, pins)) {
        const [firstMember] = group.members;
        if (!firstMember) continue;

        const grouped = group.members.length > 1;
        const hasValue = group.totalValue > 0;
        const selected = group.members.some((member) => member.id === selectedAccountId);
        const position = Cesium.Cartesian3.fromDegrees(group.longitude, group.latitude);

        const fullHeight = hasValue
          ? valueToTowerHeightMeters(group.totalValue, scaleAltitude)
          : stubTowerHeightMeters(scaleAltitude);
        const height = Math.max(1, fullHeight * progress);
        const material = hasValue
          ? Cesium.Color.fromCssColorString(valueColorHex(valueLowHex, valueMidHex, valueHighHex, valueToScaleT(group.totalValue)))
          : stubColor;
        const id = grouped ? `tower-group-${group.members.map((m) => m.id).join("-")}` : `tower-${firstMember.id}`;
        const properties = grouped
          ? {
              memberAccountIds: group.members.map((member) => member.id),
              hoverName: `${group.members.length} accounts`,
              hoverValue: group.totalValue,
            }
          : {
              accountId: firstMember.id,
              hoverName: firstMember.name,
              hoverValue: group.totalValue,
            };

        towersDataSource!.entities.add({
          id,
          position,
          properties,
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

        // Member count, sitting on the tower's apex, so a grouped tower is never
        // mistaken for one enormous account.
        if (grouped) {
          towersDataSource!.entities.add({
            id: `${id}-count`,
            position: Cesium.Cartesian3.fromDegrees(group.longitude, group.latitude, height),
            label: {
              text: group.members.length.toLocaleString(),
              font: "bold 14px 'DM Sans', sans-serif",
              fillColor: Cesium.Color.fromCssColorString(cssColorString("--color-text")).withAlpha(progress),
              style: Cesium.LabelStyle.FILL,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
              pixelOffset: new Cesium.Cartesian2(0, TOWER_LABEL_PIXEL_OFFSET),
              heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        }

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

    function renderLocationPins() {
      locationsDataSource!.entities.removeAll();
      for (const pin of locationPins) {
        const fillColor = Cesium.Color.fromCssColorString(cssColorString(LOCATION_KIND_COLOR_VAR[pin.kind] ?? "--color-text-faint"));
        const phase = stablePhase(pin.id);

        locationsDataSource!.entities.add({
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

    // The camera listener redraws towers alone — location pins and flat dots
    // are camera-independent, and rebuilding them on every zoom tick would
    // reset their pulse for no reason.
    renderTowersRef.current = () => renderTowers(progressRef.current);

    renderLocationPins();

    const startProgress = progressRef.current;
    const targetProgress = viewMode === "tower" ? 1 : 0;

    // Skip the RAF loop entirely when there's nothing to animate (the common
    // case — most renders aren't a flat/tower transition). Running it
    // unconditionally rebuilt every entity from scratch on every frame for
    // 550ms even when startProgress === targetProgress, which read as pins
    // flickering color/size/position off their anchors.
    if (startProgress === targetProgress) {
      renderDots(startProgress);
      renderTowers(startProgress);
      return;
    }

    let animationFrame: number | null = null;
    const startTime = performance.now();

    function tick(now: number) {
      const linear = Math.min(1, (now - startTime) / TOWER_TRANSITION_DURATION_MS);
      const value = startProgress + (targetProgress - startProgress) * easeOutCubic(linear);
      progressRef.current = value;
      renderDots(value);
      renderTowers(value);
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
