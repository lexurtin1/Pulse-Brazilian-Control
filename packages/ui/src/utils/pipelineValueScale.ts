/**
 * Continuous log-scaled encoding of an account's open pipeline value (sum of
 * open-stage Deal.amount) into a tower height and fill color for the map's
 * Tower view. Bounds are grounded in the real "This FY" Salesforce export (33
 * open deals: min R$1,200 / max R$3.78M / median R$24k), not round guesses.
 */

// Anything at/below the floor still renders as the shortest nonzero tower
// (never invisible); anything at/above the ceiling clamps to the tallest/most
// saturated tower rather than one outlier deal blowing out the whole scale.
export const PIPELINE_VALUE_SCALE_MIN = 1_000;
export const PIPELINE_VALUE_SCALE_MAX = 5_000_000;

/** Reference tick values for the legend's gradient bar. */
export const PIPELINE_VALUE_SCALE_TICKS = [1_000, 10_000, 100_000, 1_000_000, 5_000_000] as const;

const LOG_MIN = Math.log10(PIPELINE_VALUE_SCALE_MIN);
const LOG_MAX = Math.log10(PIPELINE_VALUE_SCALE_MAX);

/** 0 at/below the floor, 1 at/above the ceiling, log-scaled in between. */
export function valueToScaleT(value: number): number {
  if (value <= 0) return 0;
  const t = (Math.log10(value) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return Math.min(1, Math.max(0, t));
}

// Tower geometry is a fraction of the CAMERA'S ALTITUDE, not a fixed number of
// metres. The camera ranges from ~4,000km (whole Brazil) down to 100m, and no
// constant metre height survives that range: an earlier version used a fixed
// 15–250km, which was an invisible speck when zoomed out and swallowed the
// viewport when zoomed in. Sizing off altitude gives every tower a constant
// share of the screen at every zoom.
//
// Crucially the scale factor is GLOBAL (one camera altitude, shared by every
// tower on screen) rather than per-tower distance-to-camera. That keeps heights
// directly comparable — a taller tower is always a bigger deal — and leaves
// normal perspective foreshortening intact in a tilted view. Scaling each tower
// by its own distance would hold every tower at an identical pixel height and
// thereby destroy the very encoding the height exists to carry.
export const TOWER_MIN_HEIGHT_ALTITUDE_RATIO = 0.02;
export const TOWER_MAX_HEIGHT_ALTITUDE_RATIO = 0.18;

// Accounts with no open pipeline are not absent from Tower view and are not
// flat dots either — they are a uniform, deliberately stubby tower, short
// enough that it can never be mistaken for even the smallest real deal (whose
// floor is TOWER_MIN_HEIGHT_ALTITUDE_RATIO, 2.5x taller).
export const TOWER_STUB_HEIGHT_ALTITUDE_RATIO = 0.008;

export const TOWER_RADIUS_ALTITUDE_RATIO = 0.012;

// Rails against degenerate geometry at the extremes of the zoom range only —
// the ratio above governs everywhere a user actually looks from.
const TOWER_RADIUS_MIN_METERS = 150;
const TOWER_RADIUS_MAX_METERS = 45_000;
const SCALE_ALTITUDE_MIN_METERS = 1_000;
const SCALE_ALTITUDE_MAX_METERS = 6_000_000;

/**
 * The altitude towers are sized against. Clamped so the cinematic fly-in from
 * 25,000km (see SPACE_ALTITUDE_METERS) doesn't briefly extrude towers thousands
 * of kilometres into space, and so the 100m zoom floor doesn't collapse them.
 */
export function towerScaleAltitudeMeters(cameraAltitudeMeters: number): number {
  return Math.min(SCALE_ALTITUDE_MAX_METERS, Math.max(SCALE_ALTITUDE_MIN_METERS, cameraAltitudeMeters));
}

export function valueToTowerHeightMeters(value: number, scaleAltitudeMeters: number): number {
  const t = valueToScaleT(value);
  const ratio = TOWER_MIN_HEIGHT_ALTITUDE_RATIO + t * (TOWER_MAX_HEIGHT_ALTITUDE_RATIO - TOWER_MIN_HEIGHT_ALTITUDE_RATIO);
  return scaleAltitudeMeters * ratio;
}

export function stubTowerHeightMeters(scaleAltitudeMeters: number): number {
  return scaleAltitudeMeters * TOWER_STUB_HEIGHT_ALTITUDE_RATIO;
}

export function towerRadiusMeters(scaleAltitudeMeters: number): number {
  const radius = scaleAltitudeMeters * TOWER_RADIUS_ALTITUDE_RATIO;
  return Math.min(TOWER_RADIUS_MAX_METERS, Math.max(TOWER_RADIUS_MIN_METERS, radius));
}

// ── OKLCH color interpolation ────────────────────────────────────────────────
// Per the dataviz skill's diverging structure (two hues + a neutral gray
// midpoint, equal steps per arm), interpolated in OKLCH rather than sRGB so
// the ramp is perceptually smooth instead of dipping through muddy grays.

type Rgb = [number, number, number];
type Oklch = [number, number, number];

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const clamped = Math.max(0, Math.min(1, c));
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

function hexToRgb(hex: string): Rgb {
  const h = hex.trim().replace(/^#/, "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
}

function rgbToHex([r, g, b]: Rgb): string {
  const toHex = (c: number) =>
    Math.round(Math.max(0, Math.min(1, c)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Björn Ottosson's OKLab <-> linear sRGB matrices.
function linearRgbToOklab([r, g, b]: Rgb): Rgb {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

function oklabToLinearRgb([L, a, b]: Rgb): Rgb {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function hexToOklch(hex: string): Oklch {
  const linear = hexToRgb(hex).map(srgbToLinear) as Rgb;
  const [L, a, b] = linearRgbToOklab(linear);
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, H];
}

function oklchToHex([L, C, H]: Oklch): string {
  const hRad = (H * Math.PI) / 180;
  const linear = oklabToLinearRgb([L, C * Math.cos(hRad), C * Math.sin(hRad)]);
  return rgbToHex(linear.map(linearToSrgb) as Rgb);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest-path hue interpolation (never the long way round the wheel). */
function lerpHue(h0: number, h1: number, t: number): number {
  let delta = h1 - h0;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  let h = h0 + delta * t;
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;
  return h;
}

function interpolateOklchHex(hexA: string, hexB: string, t: number): string {
  const [L0, C0, H0] = hexToOklch(hexA);
  const [L1, C1, H1] = hexToOklch(hexB);
  return oklchToHex([lerp(L0, L1, t), lerp(C0, C1, t), lerpHue(H0, H1, t)]);
}

/**
 * t=0 -> lowHex, t=0.5 -> midHex, t=1 -> highHex, each arm interpolated
 * separately in OKLCH (equal steps per arm, per the diverging structure).
 */
export function valueColorHex(lowHex: string, midHex: string, highHex: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped <= 0.5) return interpolateOklchHex(lowHex, midHex, clamped / 0.5);
  return interpolateOklchHex(midHex, highHex, (clamped - 0.5) / 0.5);
}

/** A multi-stop CSS linear-gradient approximating the OKLCH ramp (CSS gradients interpolate in sRGB, so we sample it). */
export function buildValueGradientCss(lowHex: string, midHex: string, highHex: string, stops = 16): string {
  const parts: string[] = [];
  for (let i = 0; i <= stops; i++) {
    const t = i / stops;
    parts.push(`${valueColorHex(lowHex, midHex, highHex, t)} ${Math.round(t * 100)}%`);
  }
  return `linear-gradient(to right, ${parts.join(", ")})`;
}
