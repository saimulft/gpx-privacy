import { XMLParser } from 'fast-xml-parser';
import { DEFAULTS } from './defaults.ts';
import { GpxError } from './errors.ts';
import type { ParsedGpx, TrackPoint } from './types.ts';

/** Options for {@link parseGpx}. */
export interface ParseOptions {
  /** Largest document accepted, in bytes. Default 10 MiB. */
  maxBytes?: number;
}

// Entity processing stays off: no DOCTYPE tricks, no billion laughs. Values stay strings and are read as numbers below.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: false,
  processEntities: false,
  isArray: (name) => ['trk', 'trkseg', 'trkpt', 'rte', 'rtept'].includes(name),
});

type Node = Record<string, unknown>;

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value);
const nodes = (value: unknown): Node[] => (Array.isArray(value) ? value.filter(isNode) : []);

// Only the five predefined entities and character references are decoded, in one pass; DOCTYPE entities never are.
const decodeEntities = (value: string): string =>
  value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|(lt|gt|amp|quot|apos));/gi,
    (match, dec?: string, hex?: string, name?: string) => {
      if (name) return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[name.toLowerCase()] ?? match;
      const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? '', 16);
      const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
      return valid ? String.fromCodePoint(code) : match;
    },
  );

const text = (value: unknown): string | undefined => {
  if (typeof value === 'string') return decodeEntities(value.trim()) || undefined;
  if (isNode(value)) return text(value['#text']);
  return undefined;
};

const coordinate = (value: unknown): number => {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw === '' ? Number.NaN : Number(raw);
};

function toPoint(raw: Node): TrackPoint | undefined {
  const lat = coordinate(raw.lat);
  const lon = coordinate(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  const point: TrackPoint = { lat, lon };
  const eleText = text(raw.ele);
  const ele = eleText === undefined ? Number.NaN : Number(eleText);
  if (Number.isFinite(ele)) point.ele = ele;
  const time = text(raw.time);
  if (time !== undefined) point.time = time;
  return point;
}

const toPoints = (list: unknown): TrackPoint[] => nodes(list).flatMap((raw) => toPoint(raw) ?? []);

const stripBom = (value: string): string => (value.charCodeAt(0) === 0xfeff ? value.slice(1) : value);

/** UTF-8 size without encoding the whole text when the answer is already clear. */
function exceeds(source: string, maxBytes: number): boolean {
  if (source.length > maxBytes) return true; // every character takes at least one byte
  if (source.length * 3 <= maxBytes) return false; // and at most three
  return new TextEncoder().encode(source).length > maxBytes;
}

/** True when the text looks like a GPX document: XML whose root element is `<gpx>`. */
export function looksLikeGpx(source: string): boolean {
  const head = stripBom(source).trimStart().slice(0, 4096);
  if (!head.startsWith('<')) return false;
  // Past the declaration, comments and processing instructions, the first element must be gpx (any namespace prefix).
  const root = head.replace(/^(?:<\?[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*)*/, '');
  return /^<(?:[\w-]+:)?gpx[\s>]/.test(root);
}

/**
 * Reads the tracks of a GPX document (every segment of every track), or its planned routes when it has no track points.
 * Waypoints are ignored. Points with unreadable coordinates are skipped; a document cut off before its closing tags
 * still gives the points before the cut.
 *
 * @throws {GpxError} `too_large` past `maxBytes`, `invalid_gpx` when there is no `<gpx>` element.
 * @example
 * const { name, segments } = parseGpx(xml);
 * segments[0][0]; // { lat: 48.8584, lon: 2.2945, ele: 35, time: '2026-05-01T08:00:00Z' }
 */
export function parseGpx(xml: string, options: ParseOptions = {}): ParsedGpx {
  const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes;
  if (exceeds(xml, maxBytes)) {
    throw new GpxError('too_large', `The GPX document is larger than the limit of ${maxBytes} bytes.`);
  }
  let doc: unknown;
  try {
    doc = parser.parse(stripBom(xml));
  } catch {
    throw new GpxError('invalid_gpx', 'The text is not a readable GPX document.');
  }
  const gpx = isNode(doc) ? doc.gpx : undefined;
  if (!isNode(gpx)) throw new GpxError('invalid_gpx', 'The text is not a GPX document: there is no <gpx> element.');

  const tracks = nodes(gpx.trk);
  const routes = nodes(gpx.rte);
  let segments = tracks.flatMap((track) => nodes(track.trkseg).map((segment) => toPoints(segment.trkpt)));
  if (!segments.some((segment) => segment.length > 0)) segments = routes.map((route) => toPoints(route.rtept));
  const name =
    text(tracks[0]?.name) ?? text(routes[0]?.name) ?? text(isNode(gpx.metadata) ? gpx.metadata.name : undefined);
  const parsed: ParsedGpx = { segments: segments.filter((segment) => segment.length > 0) };
  if (name) parsed.name = name.slice(0, 200);
  return parsed;
}
