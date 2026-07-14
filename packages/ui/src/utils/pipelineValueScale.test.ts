import { describe, expect, it } from "vitest";
import {
  PIPELINE_VALUE_SCALE_MAX,
  PIPELINE_VALUE_SCALE_MIN,
  stubTowerHeightMeters,
  towerRadiusMeters,
  towerScaleAltitudeMeters,
  valueToTowerHeightMeters,
} from "./pipelineValueScale";

// The camera altitudes that actually matter: whole-Brazil (the app's default
// view), a state, and a city.
const BRAZIL_ALTITUDE = 4_000_000;
const STATE_ALTITUDE = 400_000;
const CITY_ALTITUDE = 20_000;

describe("tower geometry scales with the camera", () => {
  it("holds a tower at a constant share of the screen across the whole zoom range", () => {
    // The property that makes the towers legible at every zoom: height is a
    // fixed fraction of camera altitude, so the tower subtends the same angle
    // (and therefore the same screen height) whether you are 4,000km up or 20km
    // up. The old fixed-metres geometry is exactly what this rules out.
    const ratios = [BRAZIL_ALTITUDE, STATE_ALTITUDE, CITY_ALTITUDE].map(
      (altitude) => valueToTowerHeightMeters(1_000_000, towerScaleAltitudeMeters(altitude)) / altitude,
    );
    for (const ratio of ratios) {
      expect(ratio).toBeCloseTo(ratios[0]!, 10);
    }
  });

  it("keeps heights comparable: the same altitude maps a bigger deal to a taller tower", () => {
    const altitude = towerScaleAltitudeMeters(BRAZIL_ALTITUDE);
    const small = valueToTowerHeightMeters(10_000, altitude);
    const medium = valueToTowerHeightMeters(250_000, altitude);
    const large = valueToTowerHeightMeters(3_780_000, altitude);
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
  });

  it("never lets a zero-pipeline stub be mistaken for the smallest real deal", () => {
    const altitude = towerScaleAltitudeMeters(BRAZIL_ALTITUDE);
    const stub = stubTowerHeightMeters(altitude);
    const smallestRealDeal = valueToTowerHeightMeters(PIPELINE_VALUE_SCALE_MIN, altitude);
    expect(stub).toBeGreaterThan(0);
    expect(stub).toBeLessThan(smallestRealDeal);
  });

  it("clamps the value ramp rather than letting one outlier deal blow out the scale", () => {
    const altitude = towerScaleAltitudeMeters(BRAZIL_ALTITUDE);
    expect(valueToTowerHeightMeters(PIPELINE_VALUE_SCALE_MAX * 10, altitude)).toBe(
      valueToTowerHeightMeters(PIPELINE_VALUE_SCALE_MAX, altitude),
    );
  });

  it("does not extrude towers into space during the 25,000km fly-in, nor collapse them at the zoom floor", () => {
    expect(towerScaleAltitudeMeters(25_000_000)).toBeLessThan(25_000_000);
    expect(towerScaleAltitudeMeters(100)).toBeGreaterThan(100);
  });

  it("shrinks the footprint as the camera descends, which is what pulls neighbouring towers apart", () => {
    const wide = towerRadiusMeters(towerScaleAltitudeMeters(BRAZIL_ALTITUDE));
    const close = towerRadiusMeters(towerScaleAltitudeMeters(CITY_ALTITUDE));
    expect(close).toBeLessThan(wide);
    // Two Sao Paulo accounts ~5km apart used to sit under one fixed 12km
    // footprint at every zoom. At city altitude the footprint is now far
    // smaller than the gap between them, so they read as separate towers.
    expect(close).toBeLessThan(5_000 / 2);
  });
});
