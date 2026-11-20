import { DEFAULTS } from './defaults.ts';
import { GpxError } from './errors.ts';
import { parseGpx } from './parse.ts';
import type { ParseOptions } from './parse.ts';
import { simplify } from './simplify.ts';
import type { SimplifyOptions } from './simplify.ts';
import { stats } from './stats.ts';
import type { Stats, StatsOptions } from './stats.ts';
import type { TrackPoint } from './types.ts';
import { trimEnds } from './trim.ts';
import { toGpx } from './write.ts';
import type { WriteOptions } from './write.ts';

/** Options for {@link makeShareable}. */
export interface ShareableOptions
  extends ParseOptions, SimplifyOptions, StatsOptions, Pick<WriteOptions, 'creator' | 'precision' | 'dropTimes'> {
  /** Metres to hide around the start and the end. Default 500; 0 hides nothing. */
  trim?: number;
  /** Track name in the output: a string to set it, null to leave it out. Default: the name in the file. */
  name?: string | null;
}

/** What {@link makeShareable} returns. */
export interface ShareableResult {
  /** The clean GPX document, safe to share. */
  gpx: string;
  /** The track name written to the document, if any. */
  name?: string;
  /** The points written to the document, in segments. */
  segments: TrackPoint[][];
  /** Stats of the whole recorded track, ends included. */
  stats: Stats;
  /** Stats of what the document contains: trimmed and simplified. */
  shared: Stats;
  /** Point counts before and after. */
  points: { input: number; output: number };
}

/**
 * Parse, trim, simplify and write in one call: the GPX text in, a clean shareable GPX document and the stats out.
 *
 * @throws {GpxError} `invalid_gpx`, `too_large`, `empty_route` (fewer than two points) or `route_too_short` (nothing is
 * left once the ends are hidden).
 * @example
 * const { gpx, stats } = makeShareable(xml, { trim: 500, maxPoints: 500 });
 * console.log(`${(stats.distance / 1000).toFixed(1)} km`);
 */
export function makeShareable(xml: string, options: ShareableOptions = {}): ShareableResult {
  const trim = options.trim ?? DEFAULTS.trimMeters;
  const parsed = parseGpx(xml, options);
  const total = parsed.segments.reduce((sum, segment) => sum + segment.length, 0);
  if (total < 2) throw new GpxError('empty_route', 'The GPX file has no recorded track: it needs at least two points.');

  const trimmed = trimEnds<TrackPoint>(parsed.segments, trim);
  if (trimmed.length === 0) {
    throw new GpxError(
      'route_too_short',
      `The track stays within ${trim} m of its start or end, so nothing is left once they are hidden.`,
    );
  }
  const simplified = simplify<TrackPoint>(trimmed, options);
  const shown = options.dropTimes
    ? simplified.map((segment) =>
        segment.map((p): TrackPoint =>
          p.ele === undefined ? { lat: p.lat, lon: p.lon } : { lat: p.lat, lon: p.lon, ele: p.ele },
        ),
      )
    : simplified;
  const name = options.name === undefined ? parsed.name : (options.name ?? undefined);
  const result: ShareableResult = {
    gpx: toGpx(shown, { name, creator: options.creator, precision: options.precision, dropTimes: options.dropTimes }),
    segments: shown,
    stats: stats(parsed.segments, options),
    shared: stats(shown, options),
    points: { input: total, output: shown.reduce((sum, segment) => sum + segment.length, 0) },
  };
  if (name) result.name = name;
  return result;
}
