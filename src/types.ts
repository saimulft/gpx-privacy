/** One recorded position. Height and time are there only when the file has them. */
export interface TrackPoint {
  /** Latitude in degrees, -90 to 90. */
  lat: number;
  /** Longitude in degrees, -180 to 180. */
  lon: number;
  /** Height in metres. */
  ele?: number;
  /** Time exactly as written in the file, normally ISO 8601. */
  time?: string;
}

/** A GPX file read: its name and its points in segments. The gap between two segments is not travelled. */
export interface ParsedGpx {
  name?: string;
  segments: TrackPoint[][];
}
