import { DEFAULTS } from './defaults.ts';
import { haversine, radians } from './geo.ts';
import type { LatLon } from './geo.ts';
import { isSegments } from './segments.ts';

/** Options for {@link simplify}. */
export interface SimplifyOptions {
  /** Most points to keep, over all segments together. Default 500. Use `Infinity` to keep every point. */
  maxPoints?: number;
}

type XY = [number, number];

/** Long tracks are thinned to about this many points, evenly by distance, before they are simplified. */
const THIN_TO = 5000;

/** Perpendicular distance of p from the segment a-b, on a plane (points already scaled for latitude). */
function offset(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Every point at least an even share of the line's length from the last one kept (the ends always), at most `max`. */
function thin<T extends LatLon>(line: T[], max: number): T[] {
  if (line.length <= max) return line;
  let total = 0;
  for (let i = 1; i < line.length; i++) total += haversine(line[i - 1], line[i]);
  const spacing = total / max;
  const kept = [line[0]];
  let since = 0;
  for (let i = 1; i < line.length - 1; i++) {
    since += haversine(line[i - 1], line[i]);
    if (since >= spacing && spacing > 0) {
      kept.push(line[i]);
      since = 0;
    }
  }
  kept.push(line[line.length - 1]);
  // Distance alone can't bound a track that doubles back on itself: a stride does.
  if (kept.length <= max) return kept;
  const stride = Math.ceil(kept.length / max);
  return kept.filter((_, i) => i % stride === 0 || i === kept.length - 1);
}

/**
 * Douglas-Peucker run once to rank every point of a line by how much of its shape it holds. A point never outranks the
 * split that found it, so keeping the best N always keeps a valid simplification. The ends rank highest.
 */
function rank(line: XY[]): Float64Array {
  const ranks = new Float64Array(line.length);
  if (line.length === 0) return ranks;
  ranks[0] = Infinity;
  ranks[line.length - 1] = Infinity;
  const stack: [number, number, number][] = [[0, line.length - 1, Infinity]];
  while (stack.length > 0) {
    const [first, last, ceiling] = stack.pop() as [number, number, number];
    let worst = 0;
    let at = -1;
    for (let i = first + 1; i < last; i++) {
      const d = offset(line[i], line[first], line[last]);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at === -1) continue;
    const value = Math.min(worst, ceiling);
    ranks[at] = value;
    stack.push([first, at, value], [at, last, value]);
  }
  return ranks;
}

function simplifySegments<T extends LatLon>(segments: T[][], max: number): T[][] {
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (total <= max) return segments;
  // Thinning first bounds the work whatever the file holds.
  const lines =
    total > THIN_TO ? segments.map((s) => thin(s, Math.max(2, Math.floor((THIN_TO * s.length) / total)))) : segments;
  const count = lines.reduce((sum, line) => sum + line.length, 0);
  if (count <= max) return lines;

  const flat = lines.flat();
  const scale = Math.cos(radians(flat.reduce((sum, p) => sum + p.lat, 0) / flat.length));
  const ranks = new Float64Array(count);
  const starts: number[] = [];
  let offsetInFlat = 0;
  for (const line of lines) {
    starts.push(offsetInFlat);
    ranks.set(rank(line.map((p): XY => [p.lon * scale, p.lat])), offsetInFlat);
    offsetInFlat += line.length;
  }
  const best = Array.from(ranks.keys())
    .sort((a, b) => (ranks[a] === ranks[b] ? a - b : ranks[b] > ranks[a] ? 1 : -1))
    .slice(0, max);
  const keep = new Uint8Array(count);
  for (const index of best) keep[index] = 1;
  return lines.map((line, s) => line.filter((_, i) => keep[starts[s] + i] === 1)).filter((line) => line.length > 0);
}

/**
 * Reduces a track to at most `maxPoints` points while keeping its shape: Douglas-Peucker ranks every point by how much of
 * the shape it holds, then the best ones are kept in order. Segment ends rank highest. Any extra fields on the points
 * (height, time) are kept. Very long tracks are thinned evenly by distance first, so hostile input stays fast.
 *
 * @param points One list of points, or a list of segments (the result has the same shape).
 * @example
 * simplify(points, { maxPoints: 200 }); // 200 points or fewer, same route
 */
export function simplify<T extends LatLon>(points: T[], options?: SimplifyOptions): T[];
export function simplify<T extends LatLon>(points: T[][], options?: SimplifyOptions): T[][];
export function simplify<T extends LatLon>(points: T[] | T[][], options: SimplifyOptions = {}): T[] | T[][] {
  const max = options.maxPoints ?? DEFAULTS.maxPoints;
  if (Number.isNaN(max) || max < 2) throw new RangeError('maxPoints must be a number of at least 2');
  if (points.length === 0) return points;
  if (isSegments(points)) return simplifySegments(points, max);
  return simplifySegments([points], max)[0] ?? [];
}
