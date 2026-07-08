import type { Coordinate } from "@pulse-brazil/domain";

/** Turns a raw address into a candidate coordinate. Returns null rather than throwing when nothing is found — "no match" is an expected outcome, not a failure. */
export interface IGeocoder {
  geocode(address: string): Promise<Coordinate | null>;
}
