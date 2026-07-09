// Real elevation for the 3D Brazil relief model (Brazil3D.tsx). Two data
// sources, both free/keyless:
//
// 1. AWS's public "Terrarium" elevation tiles (s3 elevation-tiles-prod) —
//    same public bucket Mapzen/Tangram used to publish, still mirrored and
//    widely used as the standard free terrain-RGB source. No account,
//    token, or usage limits.
// 2. Brazil's own coastline, already generated for the flat map
//    (world-countries-tiers.geojson) — reused here to mask the terrain mesh
//    to Brazil's actual shape instead of a bounding-box rectangle.

const TERRARIUM_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const ZOOM = 5;
const TILE_SIZE = 256;
const MASK_SIZE = 1024;

export const BRAZIL_BBOX = { minLon: -74.5, maxLon: -34, minLat: -34.5, maxLat: 5.5 };

function lonToTileXf(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

function latToTileYf(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

async function loadBrazilRings(): Promise<[number, number][][]> {
  const res = await fetch("/data/world-countries-tiers.geojson");
  const geo = await res.json();
  const brazil = geo.features.find((f: { properties: { tier: string } }) => f.properties.tier === "brazil");
  const polys: [number, number][][][] = brazil.geometry.coordinates;
  // MultiPolygon: mainland + small islands. Every ring (exterior + any
  // holes) gets drawn into one mask with an evenodd fill — disjoint
  // polygons don't interfere with each other under evenodd, and holes
  // within a polygon still get punched out correctly.
  return polys.flat();
}

export interface BrazilTerrain {
  elevationAt(lon: number, lat: number): number; // meters
  isInsideBrazil(lon: number, lat: number): boolean;
}

export async function loadBrazilTerrain(): Promise<BrazilTerrain> {
  const xMin = Math.floor(lonToTileXf(BRAZIL_BBOX.minLon, ZOOM));
  const xMax = Math.floor(lonToTileXf(BRAZIL_BBOX.maxLon, ZOOM));
  const yMin = Math.floor(latToTileYf(BRAZIL_BBOX.maxLat, ZOOM)); // max lat -> smallest y
  const yMax = Math.floor(latToTileYf(BRAZIL_BBOX.minLat, ZOOM));

  const cols = xMax - xMin + 1;
  const rows = yMax - yMin + 1;
  const gridW = cols * TILE_SIZE;
  const gridH = rows * TILE_SIZE;

  const elevCanvas = document.createElement("canvas");
  elevCanvas.width = gridW;
  elevCanvas.height = gridH;
  const elevCtx = elevCanvas.getContext("2d", { willReadFrequently: true })!;

  const tileLoads: Promise<void>[] = [];
  for (let ty = yMin; ty <= yMax; ty++) {
    for (let tx = xMin; tx <= xMax; tx++) {
      tileLoads.push(
        loadImage(TERRARIUM_URL(ZOOM, tx, ty)).then((img) => {
          elevCtx.drawImage(img, (tx - xMin) * TILE_SIZE, (ty - yMin) * TILE_SIZE);
        }),
      );
    }
  }

  const [, rings] = await Promise.all([Promise.all(tileLoads), loadBrazilRings()]);

  const elevData = elevCtx.getImageData(0, 0, gridW, gridH).data;

  function elevationAt(lon: number, lat: number): number {
    const px = Math.min(gridW - 1, Math.max(0, Math.round((lonToTileXf(lon, ZOOM) - xMin) * TILE_SIZE)));
    const py = Math.min(gridH - 1, Math.max(0, Math.round((latToTileYf(lat, ZOOM) - yMin) * TILE_SIZE)));
    const i = (py * gridW + px) * 4;
    const r = elevData[i] ?? 0;
    const g = elevData[i + 1] ?? 0;
    const b = elevData[i + 2] ?? 0;
    return r * 256 + g + b / 256 - 32768;
  }

  // Rasterize the coastline into a mask once (fast: a handful of canvas
  // path fills) instead of ray-casting a 9,000+ point polygon per mesh
  // vertex (tens of millions of ops — would freeze the tab).
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = MASK_SIZE;
  maskCanvas.height = MASK_SIZE;
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true })!;

  function toMaskPixel(lon: number, lat: number): [number, number] {
    const x = ((lon - BRAZIL_BBOX.minLon) / (BRAZIL_BBOX.maxLon - BRAZIL_BBOX.minLon)) * MASK_SIZE;
    const y = ((BRAZIL_BBOX.maxLat - lat) / (BRAZIL_BBOX.maxLat - BRAZIL_BBOX.minLat)) * MASK_SIZE;
    return [x, y];
  }

  maskCtx.fillStyle = "#fff";
  maskCtx.beginPath();
  for (const ring of rings) {
    ring.forEach((point, idx) => {
      const [x, y] = toMaskPixel(point[0], point[1]);
      if (idx === 0) maskCtx.moveTo(x, y);
      else maskCtx.lineTo(x, y);
    });
    maskCtx.closePath();
  }
  maskCtx.fill("evenodd");

  const maskData = maskCtx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;

  function isInsideBrazil(lon: number, lat: number): boolean {
    const [x, y] = toMaskPixel(lon, lat);
    const px = Math.min(MASK_SIZE - 1, Math.max(0, Math.round(x)));
    const py = Math.min(MASK_SIZE - 1, Math.max(0, Math.round(y)));
    return (maskData[(py * MASK_SIZE + px) * 4 + 3] ?? 0) > 0;
  }

  return { elevationAt, isInsideBrazil };
}
