import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GpxError, looksLikeGpx, parseGpx } from '../src/index.ts';
import { gpxOf, line, NULL_ISLAND } from './fixtures.ts';

const BOM = String.fromCharCode(0xfeff);
const NS = 'xmlns="http://www.topografix.com/GPX/1/1"';
const wrap = (inner: string) => `<?xml version="1.0"?><gpx version="1.1" ${NS}>${inner}</gpx>`;

describe('parseGpx', () => {
  it('reads points with height and time', () => {
    const track = line(NULL_ISLAND, 90, 1000, 10, { ele: (i) => 10 + i, every: 5 });
    const { segments } = parseGpx(gpxOf([track]));
    assert.equal(segments.length, 1);
    assert.equal(segments[0].length, 11);
    assert.deepEqual(segments[0][3], track[3]);
    assert.equal(segments[0][3].time, '2026-05-01T08:00:15.000Z');
  });

  it('leaves height and time off points that have none', () => {
    const { segments } = parseGpx(gpxOf([line(NULL_ISLAND, 0, 100, 4)]));
    for (const point of segments[0]) assert.deepEqual(Object.keys(point), ['lat', 'lon']);
  });

  it('keeps every segment of every track, in order, as separate segments', () => {
    const a = line(NULL_ISLAND, 0, 100, 3);
    const b = line(NULL_ISLAND, 90, 100, 2);
    const c = line(NULL_ISLAND, 180, 100, 1);
    const xml = wrap(
      `<trk><trkseg>${a.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"/>`).join('')}</trkseg>` +
        `<trkseg>${b.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"/>`).join('')}</trkseg></trk>` +
        `<trk><trkseg>${c.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"/>`).join('')}</trkseg></trk>`,
    );
    const { segments } = parseGpx(xml);
    assert.deepEqual(
      segments.map((s) => s.length),
      [4, 3, 2],
    );
  });

  it('reads a self-closing trackpoint', () => {
    const { segments } = parseGpx(wrap('<trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk>'));
    assert.deepEqual(segments, [[{ lat: 1, lon: 2 }]]);
  });

  it('ignores waypoints and falls back to planned routes when there is no track', () => {
    const xml = wrap(
      '<wpt lat="5" lon="5"><name>Cafe</name></wpt><rte><name>Plan</name><rtept lat="1" lon="1"/><rtept lat="1" lon="2"/></rte>',
    );
    const parsed = parseGpx(xml);
    assert.deepEqual(parsed.segments, [
      [
        { lat: 1, lon: 1 },
        { lat: 1, lon: 2 },
      ],
    ]);
    assert.equal(parsed.name, 'Plan');
  });

  it('prefers tracks over routes and waypoints', () => {
    const xml = wrap(
      '<wpt lat="5" lon="5"/><rte><rtept lat="9" lon="9"/></rte><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk>',
    );
    assert.deepEqual(parseGpx(xml).segments, [[{ lat: 1, lon: 1 }]]);
  });

  it('reads files that use a namespace prefix', () => {
    const xml =
      '<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1"><g:trk><g:trkseg><g:trkpt lat="1" lon="2"><g:ele>3</g:ele></g:trkpt></g:trkseg></g:trk></g:gpx>';
    assert.deepEqual(parseGpx(xml).segments, [[{ lat: 1, lon: 2, ele: 3 }]]);
  });

  it('skips points whose coordinates are missing, empty, out of range or not numbers', () => {
    const xml = wrap(
      '<trk><trkseg><trkpt lat="91" lon="0"/><trkpt lat="0" lon="181"/><trkpt lat="" lon="3"/><trkpt lat="1"/><trkpt lat="x" lon="1"/>' +
        '<trkpt lat="-90" lon="-180"/></trkseg></trk>',
    );
    assert.deepEqual(parseGpx(xml).segments, [[{ lat: -90, lon: -180 }]]);
  });

  it('drops an unreadable height but keeps the point', () => {
    const xml = wrap('<trk><trkseg><trkpt lat="1" lon="1"><ele>high</ele></trkpt></trkseg></trk>');
    assert.deepEqual(parseGpx(xml).segments, [[{ lat: 1, lon: 1 }]]);
  });

  it('drops segments that end up empty', () => {
    const xml = wrap('<trk><trkseg/><trkseg><trkpt lat="1" lon="1"/></trkseg></trk>');
    assert.equal(parseGpx(xml).segments.length, 1);
  });

  it('names the file after its track, then its route, then its metadata', () => {
    const seg = '<trkseg><trkpt lat="1" lon="1"/></trkseg>';
    assert.equal(
      parseGpx(wrap(`<metadata><name>Meta</name></metadata><trk><name>Track</name>${seg}</trk>`)).name,
      'Track',
    );
    assert.equal(parseGpx(wrap(`<metadata><name>Meta</name></metadata><trk>${seg}</trk>`)).name, 'Meta');
    assert.equal(parseGpx(wrap(`<trk>${seg}</trk>`)).name, undefined);
  });

  it('decodes the predefined entities in names and cuts long names to 200 characters', () => {
    const seg = '<trkseg><trkpt lat="1" lon="1"/></trkseg>';
    assert.equal(
      parseGpx(wrap(`<trk><name>Tom &amp; Jerry &lt;3 &#65;&#x42;</name>${seg}</trk>`)).name,
      'Tom & Jerry <3 AB',
    );
    assert.equal(parseGpx(wrap(`<trk><name>${'x'.repeat(300)}</name>${seg}</trk>`)).name?.length, 200);
  });

  it('never expands entities declared in a DOCTYPE', () => {
    const xml =
      '<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY secret "EXPANDED"><!ENTITY a "&b;&b;"><!ENTITY b "lol">]>' +
      `<gpx ${NS}><trk><name>&secret; &a;</name><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>`;
    const { name } = parseGpx(xml);
    assert.equal(name, '&secret; &a;');
  });

  it('strips a byte order mark', () => {
    assert.equal(parseGpx(`${BOM}${wrap('<trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk>')}`).segments.length, 1);
  });

  it('keeps the points before a missing tail', () => {
    const xml = `<gpx ${NS}><trk><trkseg><trkpt lat="1" lon="1"></trkpt><trkpt lat="2" lon="2"></trkpt>`;
    assert.equal(parseGpx(xml).segments[0].length, 2);
  });

  it('returns no segments for a valid file without a track', () => {
    assert.deepEqual(parseGpx(wrap('<wpt lat="1" lon="1"/>')).segments, []);
  });

  it('refuses text that is not GPX', () => {
    for (const text of [
      '<html><body>hi</body></html>',
      '',
      'plain text',
      `<gpx ${NS}><trk><trkseg><trkpt lat="1" lon="1"`,
    ]) {
      assert.throws(
        () => parseGpx(text),
        (error) => error instanceof GpxError && error.code === 'invalid_gpx',
        text,
      );
    }
  });

  it('refuses a document over the size limit, counted in bytes', () => {
    const xml = gpxOf([line(NULL_ISLAND, 0, 1000, 20)]);
    assert.doesNotThrow(() => parseGpx(xml, { maxBytes: xml.length }));
    assert.throws(
      () => parseGpx(xml, { maxBytes: xml.length - 1 }),
      (error) => error instanceof GpxError && error.code === 'too_large',
    );
    const wide = wrap(`<trk><name>${'é'.repeat(100)}</name><trkseg><trkpt lat="1" lon="1"/></trkseg></trk>`);
    const bytes = new TextEncoder().encode(wide).length;
    assert.ok(bytes > wide.length);
    assert.throws(() => parseGpx(wide, { maxBytes: bytes - 1 }), GpxError);
    assert.doesNotThrow(() => parseGpx(wide, { maxBytes: bytes }));
  });

  it('refuses a document over 10 MiB by default', () => {
    assert.throws(
      () => parseGpx(`<gpx>${' '.repeat(10 * 1024 * 1024)}</gpx>`),
      (error) => error instanceof GpxError && error.code === 'too_large',
    );
  });
});

describe('looksLikeGpx', () => {
  it('accepts a GPX document, with a declaration, comments, a BOM or a namespace prefix', () => {
    assert.ok(looksLikeGpx(wrap('')));
    assert.ok(looksLikeGpx(`${BOM}  <!-- c --><?xml version="1.0"?>\n<!-- another --><gpx>`));
    assert.ok(looksLikeGpx('<g:gpx xmlns:g="x">'));
  });

  it('refuses anything else', () => {
    for (const text of ['', 'hello', '<html>', '<gpxfile>', '{"gpx":1}', '<?xml version="1.0"?><kml>']) {
      assert.equal(looksLikeGpx(text), false, text);
    }
  });
});
