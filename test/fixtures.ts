// Synthetic tracks for the tests: every coordinate is computed from 0,0 or from a famous public landmark.
import { haversine } from '../src/index.ts';
import type { LatLon, TrackPoint } from '../src/index.ts';

/** Latitude 0, longitude 0 ("Null Island"). */
export const NULL_ISLAND: LatLon = { lat: 0, lon: 0 };
/** The Eiffel Tower, standing in for "home". */
export const EIFFEL_TOWER: LatLon = { lat: 48.8584, lon: 2.2945 };

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (degrees: number) => (degrees * Math.PI) / 180;
const deg = (radians: number) => (radians * 180) / Math.PI;

/** The place `meters` away from `from`, heading `bearing` degrees clockwise from north. */
export function destination(from: LatLon, bearing: number, meters: number): LatLon {
  const d = meters / EARTH_RADIUS_M;
  const b = rad(bearing);
  const lat1 = rad(from.lat);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 =
    rad(from.lon) +
    Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lon: deg(lon2) };
}

export interface Decoration {
  /** Height of point `i`. Left out when not given. */
  ele?: (i: number) => number;
  /** Seconds between points. Times are left out when not given. */
  every?: number;
  /** Time of the first point. */
  from?: string;
}

function decorate(place: LatLon, i: number, extra: Decoration): TrackPoint {
  const point: TrackPoint = { lat: place.lat, lon: place.lon };
  if (extra.ele) point.ele = extra.ele(i);
  if (extra.every !== undefined) {
    point.time = new Date(Date.parse(extra.from ?? '2026-05-01T08:00:00Z') + i * extra.every * 1000).toISOString();
  }
  return point;
}

/** A straight track of `steps + 1` evenly spaced points, `meters` long in total. */
export function line(
  from: LatLon,
  bearing: number,
  meters: number,
  steps: number,
  extra: Decoration = {},
): TrackPoint[] {
  return Array.from({ length: steps + 1 }, (_, i) =>
    decorate(destination(from, bearing, (meters * i) / steps), i, extra),
  );
}

/** A closed loop around `center`: it starts and ends `radius` metres north of it. */
export function circle(center: LatLon, radius: number, steps: number, extra: Decoration = {}): TrackPoint[] {
  return Array.from({ length: steps + 1 }, (_, i) =>
    decorate(destination(center, (360 * i) / steps, radius), i, extra),
  );
}

/** `count` readings of GPS jitter, a few metres either way, around one place (a rider waiting at home). */
export function jitter(at: LatLon, count: number, extra: Decoration = {}): TrackPoint[] {
  return Array.from({ length: count }, (_, i) =>
    decorate({ lat: at.lat + Math.sin(i) * 0.00003, lon: at.lon + Math.cos(i * 1.7) * 0.00003 }, i, extra),
  );
}

/** A GPX document of these segments, with whatever XML is given before the track. */
export function gpxOf(segments: TrackPoint[][], extra = '', name?: string): string {
  const point = (p: TrackPoint) =>
    `<trkpt lat="${p.lat}" lon="${p.lon}">${p.ele === undefined ? '' : `<ele>${p.ele}</ele>`}${p.time ? `<time>${p.time}</time>` : ''}</trkpt>`;
  const body = segments.map((segment) => `<trkseg>${segment.map(point).join('')}</trkseg>`).join('');
  return `<?xml version="1.0"?><gpx version="1.1" creator="Test Device 9" xmlns="http://www.topografix.com/GPX/1/1">${extra}<trk>${name ? `<name>${name}</name>` : ''}${body}</trk></gpx>`;
}

/** The smallest distance in metres from `place` to any of the points. */
export const nearest = (place: LatLon, points: LatLon[]): number => Math.min(...points.map((p) => haversine(place, p)));

/** How far the original points stray from the polyline through the simplified ones, in metres (small areas only). */
export function maxDeviation(original: LatLon[], simplified: LatLon[]): number {
  const lat0 = rad(original[0].lat);
  const xy = (p: LatLon): [number, number] => [
    rad(p.lon) * Math.cos(lat0) * EARTH_RADIUS_M,
    rad(p.lat) * EARTH_RADIUS_M,
  ];
  const poly = simplified.map(xy);
  let worst = 0;
  for (const point of original) {
    const [x, y] = xy(point);
    let best = Infinity;
    for (let i = 1; i < poly.length; i++) {
      const [ax, ay] = poly[i - 1];
      const [bx, by] = poly[i];
      const length = (bx - ax) ** 2 + (by - ay) ** 2;
      const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / length));
      best = Math.min(best, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}
