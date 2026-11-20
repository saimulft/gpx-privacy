/** A position on the globe, in degrees. */
export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

export const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two positions in metres (haversine).
 *
 * @example
 * haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }); // about 111195
 */
export function haversine(a: LatLon, b: LatLon): number {
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
