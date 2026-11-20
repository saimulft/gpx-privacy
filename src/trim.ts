import { DEFAULTS } from './defaults.ts';
import { haversine } from './geo.ts';
import type { LatLon } from './geo.ts';
import { toSegments } from './segments.ts';

/**
 * Removes every point within `meters` of where the track started or ended, wherever along the track it is: GPS jitter at
 * home, or a loop that passes home mid-ride, never shows it. A segment that crosses the zone is split in two. A track
 * shorter than the radius comes back empty.
 *
 * @param points One list of points, or a list of segments.
 * @param meters Radius to hide around the first and the last point. Default 500; 0 keeps everything.
 * @returns The remaining points, as segments.
 * @example
 * trimEnds(segments, 300); // nothing within 300 m of the start or the end
 */
export function trimEnds<T extends LatLon>(points: T[] | T[][], meters: number = DEFAULTS.trimMeters): T[][] {
  if (!(meters >= 0)) throw new RangeError('meters must be a number of 0 or more');
  const segments = toSegments(points);
  const all = segments.flat();
  if (all.length === 0) return [];
  const first = all[0];
  const last = all[all.length - 1];
  const kept: T[][] = [];
  for (const segment of segments) {
    let part: T[] = [];
    for (const point of segment) {
      if (haversine(point, first) < meters || haversine(point, last) < meters) {
        if (part.length > 0) kept.push(part);
        part = [];
      } else part.push(point);
    }
    if (part.length > 0) kept.push(part);
  }
  return kept;
}
