/** The default value of every tunable limit. Each one can be overridden through the matching option. */
export const DEFAULTS = {
  /** Metres hidden around the start and the end of a track. */
  trimMeters: 500,
  /** Most points a simplified track keeps. */
  maxPoints: 500,
  /** Largest GPX document `parseGpx` accepts, in bytes (10 MiB). */
  maxBytes: 10 * 1024 * 1024,
  /** Height changes up to this many metres count as GPS noise, not climbing. */
  climbThreshold: 5,
} as const;
