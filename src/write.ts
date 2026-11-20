import { toSegments } from './segments.ts';
import type { TrackPoint } from './types.ts';

/** Options for {@link toGpx}. */
export interface WriteOptions {
  /** Track name. Left out when missing. */
  name?: string;
  /** Value of the `creator` attribute. Default `gpx-privacy`. */
  creator?: string;
  /** Decimal places kept in latitude and longitude, 0 to 15. Default 6 (about 11 cm); 4 is about 11 m. */
  precision?: number;
  /** Leave every `<time>` out. Default false. */
  dropTimes?: boolean;
}

const escapeXml = (value: string): string => value.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * A minimal GPX 1.1 document of the track: positions, heights and times only, one `<trkseg>` per segment. No
 * waypoints, author, device or extension data is written.
 *
 * @param points One list of points, or a list of segments.
 * @example
 * const xml = toGpx(segments, { name: 'Sunday ride' });
 */
export function toGpx(points: TrackPoint[] | TrackPoint[][], options: WriteOptions = {}): string {
  const precision = options.precision ?? 6;
  if (!Number.isInteger(precision) || precision < 0 || precision > 15) {
    throw new RangeError('precision must be a whole number from 0 to 15');
  }
  const coordinate = (degrees: number) => Number(degrees.toFixed(precision));
  const point = (p: TrackPoint) =>
    `<trkpt lat="${coordinate(p.lat)}" lon="${coordinate(p.lon)}">${p.ele === undefined ? '' : `<ele>${p.ele}</ele>`}${p.time && !options.dropTimes ? `<time>${escapeXml(p.time)}</time>` : ''}</trkpt>`;
  const segments = toSegments(points).filter((segment) => segment.length > 0);
  const body = segments.map((segment) => `<trkseg>\n${segment.map(point).join('\n')}\n</trkseg>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="${escapeXml(options.creator ?? 'gpx-privacy')}" xmlns="http://www.topografix.com/GPX/1/1">`,
    `<trk>${options.name ? `<name>${escapeXml(options.name)}</name>` : ''}`,
    ...body,
    '</trk>',
    '</gpx>',
    '',
  ].join('\n');
}
