import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseGpx, toGpx } from '../src/index.ts';
import { circle, line, NULL_ISLAND } from './fixtures.ts';

describe('toGpx', () => {
  it('writes a minimal GPX 1.1 document', () => {
    const xml = toGpx(line(NULL_ISLAND, 0, 100, 2, { ele: (i) => 10 + i, every: 5 }), { name: 'Evening ride' });
    assert.match(
      xml,
      /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<gpx version="1\.1" creator="gpx-privacy" xmlns="http:\/\/www\.topografix\.com\/GPX\/1\/1">/,
    );
    assert.match(xml, /<trk><name>Evening ride<\/name>/);
    assert.equal(xml.match(/<trkpt /g)?.length, 3);
    assert.match(xml, /<ele>11<\/ele><time>2026-05-01T08:00:05\.000Z<\/time><\/trkpt>/);
    assert.ok(xml.endsWith('</trk>\n</gpx>\n'));
    for (const extra of ['<wpt', '<metadata', '<extensions', '<author', '<rte']) assert.ok(!xml.includes(extra), extra);
  });

  it('leaves out height, time and name when there are none', () => {
    const xml = toGpx(line(NULL_ISLAND, 0, 100, 2));
    assert.ok(!xml.includes('<ele>') && !xml.includes('<time>') && !xml.includes('<name>'));
  });

  it('keeps a height of zero', () => {
    assert.match(toGpx([{ lat: 1, lon: 1, ele: 0 }]), /<ele>0<\/ele>/);
  });

  it('writes one trkseg per segment', () => {
    const xml = toGpx([line(NULL_ISLAND, 0, 100, 2), [], line(NULL_ISLAND, 90, 100, 3)]);
    assert.equal(xml.match(/<trkseg>/g)?.length, 2);
  });

  it('escapes the name, the creator and the times', () => {
    const xml = toGpx([{ lat: 1, lon: 1, time: 'a<b&c' }], { name: `<a href="x">Tom & 'Jerry'</a>`, creator: 'x"y' });
    assert.ok(!xml.includes('<a href'));
    assert.ok(xml.includes('creator="x&#34;y"'));
    assert.ok(xml.includes('<time>a&#60;b&#38;c</time>'));
    assert.equal(parseGpx(xml).name, `<a href="x">Tom & 'Jerry'</a>`);
  });

  it('reads back as the same track', () => {
    const track = circle(NULL_ISLAND, 3000, 50, { ele: (i) => 20 + i / 2, every: 7 }).map((p) => ({
      ...p,
      lat: Number(p.lat.toFixed(6)) + 0,
      lon: Number(p.lon.toFixed(6)) + 0,
    }));
    assert.deepEqual(parseGpx(toGpx([track.slice(0, 20), track.slice(20)], { name: 'Loop' })), {
      name: 'Loop',
      segments: [track.slice(0, 20), track.slice(20)],
    });
  });

  it('writes a valid document for an empty track', () => {
    const xml = toGpx([]);
    assert.ok(!xml.includes('<trkseg>'));
    assert.deepEqual(parseGpx(xml).segments, []);
  });

  it('rounds coordinates to 6 decimals by default and to the precision asked for', () => {
    const track = [{ lat: 48.858370123456, lon: 2.294481987654 }];
    assert.match(toGpx(track), /<trkpt lat="48\.85837" lon="2\.294482">/);
    assert.match(toGpx(track, { precision: 3 }), /<trkpt lat="48\.858" lon="2\.294">/);
    assert.match(toGpx(track, { precision: 0 }), /<trkpt lat="49" lon="2">/);
    assert.throws(() => toGpx(track, { precision: -1 }), RangeError);
    assert.throws(() => toGpx(track, { precision: 1.5 }), RangeError);
    assert.throws(() => toGpx(track, { precision: 16 }), RangeError);
  });

  it('leaves the times out with dropTimes and keeps heights', () => {
    const track = line(NULL_ISLAND, 0, 100, 2, { ele: (i) => i, every: 5 });
    assert.ok(toGpx(track).includes('<time>'));
    const xml = toGpx(track, { dropTimes: true });
    assert.ok(!xml.includes('<time>'));
    assert.equal(xml.match(/<ele>/g)?.length, 3);
  });

  it('sets the creator', () => {
    assert.match(toGpx([], { creator: 'my-app 1.0' }), /creator="my-app 1\.0"/);
  });
});
