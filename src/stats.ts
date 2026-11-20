import { DEFAULTS } from './defaults.ts';
import { haversine } from './geo.ts';
import { toSegments } from './segments.ts';
import type { TrackPoint } from './types.ts';

/** Options for {@link stats}. */
export interface StatsOptions {
  /** Height changes up to this many metres are treated as GPS noise. Default 5. */
  climbThreshold?: number;
}

/** What a track adds up to. */
export interface Stats {
  /** Number of points. */
  points: number;
  /** Metres travelled. The gaps between segments are left out. */
  distance: number;
  /** Metres climbed, or null when no point has a height. */
  climb: number | null;
  /** Metres descended, or null when no point has a height. */
  descent: number | null;
  /** Seconds between the first and last time of each segment, summed. Null when fewer than two times can be read. */
  duration: number | null;
}

/**
 * Distance, climb, descent and duration of a track. Climb and descent use a hysteresis against GPS noise: the running
 * height only moves once a reading is more than `climbThreshold` metres away from it, and only then counts.
 *
 * @param points One list of points, or a list of segments.
 * @example
 * const { distance, climb } = stats(segments);
 * console.log(`${(distance / 1000).toFixed(1)} km, ${Math.round(climb ?? 0)} m up`);
 */
export function stats(points: TrackPoint[] | TrackPoint[][], options: StatsOptions = {}): Stats {
  const threshold = options.climbThreshold ?? DEFAULTS.climbThreshold;
  const segments = toSegments(points);
  let count = 0;
  let distance = 0;
  let climb = 0;
  let descent = 0;
  let hasHeights = false;
  let duration = 0;
  let hasDuration = false;

  for (const segment of segments) {
    count += segment.length;
    for (let i = 1; i < segment.length; i++) distance += haversine(segment[i - 1], segment[i]);

    let anchor: number | undefined;
    let earliest = Infinity;
    let latest = -Infinity;
    let times = 0;
    for (const { ele, time } of segment) {
      if (ele !== undefined) {
        hasHeights = true;
        if (anchor === undefined) anchor = ele;
        else if (ele - anchor > threshold) {
          climb += ele - anchor;
          anchor = ele;
        } else if (anchor - ele > threshold) {
          descent += anchor - ele;
          anchor = ele;
        }
      }
      const at = time === undefined ? Number.NaN : Date.parse(time);
      if (!Number.isNaN(at)) {
        earliest = Math.min(earliest, at);
        latest = Math.max(latest, at);
        times++;
      }
    }
    if (times >= 2) {
      duration += (latest - earliest) / 1000;
      hasDuration = true;
    }
  }

  return {
    points: count,
    distance,
    climb: hasHeights ? climb : null,
    descent: hasHeights ? descent : null,
    duration: hasDuration ? duration : null,
  };
}
