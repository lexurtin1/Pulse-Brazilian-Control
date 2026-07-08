import type { IGeocoder } from "@pulse-brazil/application";
import { Coordinate } from "@pulse-brazil/domain";

interface GoogleGeocodeResult {
  geometry: { location: { lat: number; lng: number } };
}

interface GoogleGeocodeResponse {
  status: string;
  results: GoogleGeocodeResult[];
  error_message?: string;
}

const GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

/**
 * Google Maps Geocoding REST API via native fetch — no npm client, per the
 * task. Every request is restricted to Brazil (components=country:BR),
 * since that's the only market Pulse Brazil resolves addresses for.
 * Results are cached in-process so re-geocoding the same address within a
 * session (e.g. retries, repeated ResolveAccountCoordinate calls) doesn't
 * re-hit the API or re-spend quota.
 */
export class GeocoderAdapter implements IGeocoder {
  private readonly cache = new Map<string, Coordinate | null>();

  constructor(private readonly apiKey: string) {}

  async geocode(address: string): Promise<Coordinate | null> {
    if (this.cache.has(address)) {
      return this.cache.get(address) ?? null;
    }

    const url = new URL(GEOCODE_ENDPOINT);
    url.searchParams.set("address", address);
    url.searchParams.set("components", "country:BR");
    url.searchParams.set("key", this.apiKey);

    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new Error(`Geocoding request failed for "${address}": ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!response.ok) {
      throw new Error(`Geocoding request failed for "${address}": HTTP ${response.status}`);
    }

    const body = (await response.json()) as GoogleGeocodeResponse;

    if (body.status === "ZERO_RESULTS") {
      this.cache.set(address, null);
      return null;
    }

    if (body.status !== "OK") {
      throw new Error(`Geocoding request failed for "${address}": ${body.status}${body.error_message ? ` — ${body.error_message}` : ""}`);
    }

    const [first] = body.results;
    if (!first) {
      this.cache.set(address, null);
      return null;
    }

    const coordinate = Coordinate.of(first.geometry.location.lat, first.geometry.location.lng);
    this.cache.set(address, coordinate);
    return coordinate;
  }
}
