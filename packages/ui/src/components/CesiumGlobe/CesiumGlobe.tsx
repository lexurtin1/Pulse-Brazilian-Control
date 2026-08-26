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

// One fixed screen-space size at every zoom — an earlier version shrank dots
// as the camera got close, which made them unreadable exactly when you were
// looking hardest.
//
// Small enough that São Paulo reads as separate accounts rather than one
// overlapping blob: at 40px the cluster there covered its own neighbourhood.
// Legibility against the satellite imagery comes from the light outline, not
// from size — a solid fill ringed in the surface colour separates from both
// the pale city and the dark forest without needing to be large.
const ACCOUNT_PIN_SIZE = 13;
const ACCOUNT_PIN_SELECTED_SIZE = 19;

const ACCOUNT_PIN_OUTLINE_WIDTH = 2;
const ACCOUNT_PIN_SELECTED_OUTLINE_WIDTH = 3;

// Each dot's terrain height is sampled ONCE, baked into a fixed position, and
// anchored with NONE — the middle ground between the two things that were
// tried before and both looked wrong.
//
// CLAMP_TO_GROUND re-resolves the height as terrain tiles stream in, which is
// what read as dots "jittering" while zooming. A plain ellipsoid anchor holds
// still, but sits at sea level: São Paulo's terrain is ~760m up, so tilting
// the camera slid the dot roughly h·tan(tilt) away from its own city — still
// drawn on top (see disableDepthTestDistance) but visibly off its mark.
//
// A one-off sample is a plain number afterwards, so no tile load can nudge it,
// and it is the real ground height, so tilt cannot pull it off the city.
const PIN_HEIGHT_REFERENCE = Cesium.HeightReference.NONE;

// Dots are static. They used to breathe on a loop to "feel alive", but with
// this many accounts in one metro area the map read as restless rather than
// alive, and a size that changes every frame makes crowded dots harder to
// tell apart. Selection is shown by size and outline colour instead — a
// difference you can read in a still frame.

// Keyed by coordinate rather than account id: the ground height belongs to the
// place, so two accounts in the same building share one terrain sample, and an
// account whose coordinate is corrected gets a fresh one.
function coordinateKey(pin: AccountMapPinDto): string {
  return `${pin.coordinate.longitude},${pin.coordinate.latitude}`;
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
  // World terrain streams in asynchronously after the viewer mounts. Sampling
  // before it arrives hits the ellipsoid placeholder and comes back 0, which
  // is exactly the sea-level anchor the sampling exists to avoid — so the pin
  // render awaits this.
  const terrainReadyRef = useRef<Promise<Cesium.TerrainProvider> | null>(null);
  // Ground height by coordinate, so re-rendering for a selection change reuses
  // what was already sampled instead of re-fetching terrain on every pin click.
  const sampledHeightsRef = useRef(new Map<string, number>());
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const token = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
    if (token) Cesium.Ion.defaultAccessToken = token;

    // World terrain gives the globe its 3D relief, and the account dots sample
    // it once each so they sit on that surface (see PIN_HEIGHT_REFERENCE).
    const worldTerrain = Cesium.Terrain.fromWorldTerrain();
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
      terrainReadyRef.current = null;
    };
  }, []);

  // Account dots as Cesium entities, colored by client type — the same palette
  // the legend, Open Deals, Live Feed and the Account Dossier header use,
  // so a client type is always the same color wherever it appears.
  useEffect(() => {
    const viewer = viewerRef.current;
    const accountsDataSource = accountsDataSourceRef.current;
    if (!viewer || !accountsDataSource) return;

    let cancelled = false;

    async function groundHeights(): Promise<Map<string, number>> {
      const cache = sampledHeightsRef.current;
      const unsampled = pins.filter((pin) => !cache.has(coordinateKey(pin)));
      if (unsampled.length === 0) return cache;

      const cartographics = unsampled.map((pin) =>
        Cesium.Cartographic.fromDegrees(pin.coordinate.longitude, pin.coordinate.latitude),
      );
      try {
        const terrainProvider = await terrainReadyRef.current;
        if (terrainProvider) await Cesium.sampleTerrainMostDetailed(terrainProvider, cartographics);
      } catch {
        // Terrain unavailable — the heights stay 0 and the dots sit on the
        // ellipsoid, which is where they were before this sampling existed.
        // Not worth failing the whole map over.
        return cache;
      }
      unsampled.forEach((pin, index) => {
        const height = cartographics[index]?.height;
        if (height !== undefined && Number.isFinite(height)) cache.set(coordinateKey(pin), height);
      });
      return cache;
    }

    function render(heights: Map<string, number>) {
      const surfaceColor = Cesium.Color.fromCssColorString(cssColorString("--color-surface"));
      const activeColor = Cesium.Color.fromCssColorString(cssColorString("--color-primary-active"));

      accountsDataSource!.entities.removeAll();

      for (const pin of pins) {
        const clientColor = Cesium.Color.fromCssColorString(
          cssColorString(clientTypeColorVar(primaryClientType(pin.clientTypes))),
        );
        const selected = pin.id === selectedAccountId;

        accountsDataSource!.entities.add({
          id: `account-pin-${pin.id}`,
          position: Cesium.Cartesian3.fromDegrees(
            pin.coordinate.longitude,
            pin.coordinate.latitude,
            heights.get(coordinateKey(pin)) ?? 0,
          ),
          properties: {
            accountId: pin.id,
            hoverName: pin.name,
            hoverValue: pin.openPipelineValue,
          },
          point: {
            // A plain number, not a CallbackProperty — nothing re-evaluates
            // per frame now that the size is fixed.
            pixelSize: selected ? ACCOUNT_PIN_SELECTED_SIZE : ACCOUNT_PIN_SIZE,
            color: clientColor,
            outlineColor: selected ? activeColor : surfaceColor,
            outlineWidth: selected ? ACCOUNT_PIN_SELECTED_OUTLINE_WIDTH : ACCOUNT_PIN_OUTLINE_WIDTH,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            heightReference: PIN_HEIGHT_REFERENCE,
          },
        });
      }
    }

    // Draw immediately at whatever heights are already known, so selecting a
    // pin never blanks the map while terrain is fetched, then redraw once the
    // sample lands. On every render after the first, the cache is warm and the
    // second pass is a no-op repaint.
    render(sampledHeightsRef.current);
    void groundHeights().then((heights) => {
      if (!cancelled) render(heights);
    });

    return () => {
      cancelled = true;
    };
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
