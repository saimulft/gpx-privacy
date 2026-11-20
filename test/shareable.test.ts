import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GpxError, haversine, makeShareable, parseGpx } from '../src/index.ts';
import { circle, destination, EIFFEL_TOWER, gpxOf, jitter, line, NULL_ISLAND, nearest } from './fixtures.ts';

const refused = (code: string) => (error: unknown) => error instanceof GpxError && error.code === code;

describe('makeShareable', () => {
  it('answers the route: stats, at most 500 points, a document that parses', () => {
    // A 100 km loop of 2,000 recorded points.
    const loop = circle(NULL_ISLAND, 16_000, 2000, {
      ele: (i) => 100 + 50 * Math.sin((i / 2000) * 4 * Math.PI),
      every: 8,
    });
    const result = makeShareable(gpxOf([loop], '', 'Big loop'));
    assert.ok(Math.abs(result.stats.distance / 1000 - 100.53) < 0.1);
    assert.equal(result.points.input, 2001);
    assert.ok(result.points.output <= 500);
    assert.equal(result.name, 'Big loop');
    assert.equal(parseGpx(result.gpx).segments.flat().length, result.points.output);
    assert.equal(result.stats.duration, 16_000);
    assert.ok(result.stats.climb !== null && result.stats.climb > 100);
  });

  it('hides the ends from the points and from the file', () => {
    const loop = circle(NULL_ISLAND, 16_000, 2000);
    const start = loop[0];
    const result = makeShareable(gpxOf([loop]));
    const shared = parseGpx(result.gpx).segments.flat();
    assert.ok(nearest(start, result.segments.flat()) >= 500);
    assert.ok(nearest(start, shared) >= 500);
  });

  it('shows the ends again when asked to trim nothing', () => {
    const loop = circle(NULL_ISLAND, 16_000, 2000);
    const result = makeShareable(gpxOf([loop]), { trim: 0 });
    assert.ok(haversine(result.segments[0][0], loop[0]) < 1);
  });

  it('hides everything within 500 m of home, even after minutes of GPS jitter there', () => {
    const ride = line(destination(EIFFEL_TOWER, 0, 30), 0, 20_000, 400);
    const result = makeShareable(gpxOf([[...jitter(EIFFEL_TOWER, 600), ...ride]]));
    assert.ok(nearest(EIFFEL_TOWER, result.segments.flat()) >= 500);
    assert.ok(nearest(EIFFEL_TOWER, parseGpx(result.gpx).segments.flat()) >= 500);
    assert.ok(nearest(EIFFEL_TOWER, result.segments.flat()) < 600); // and the rest of the ride is still there
  });

  it('refuses to hide the ends of a route that never leaves them', () => {
    const ride = [...jitter(EIFFEL_TOWER, 600), ...line(destination(EIFFEL_TOWER, 0, 30), 0, 400, 20)];
    assert.throws(() => makeShareable(gpxOf([ride])), refused('route_too_short'));
  });

  it('refuses a track shorter than the trim distance, and accepts it with a smaller trim', () => {
    const short = line(NULL_ISLAND, 0, 900, 30);
    assert.throws(() => makeShareable(gpxOf([short])), refused('route_too_short'));
    assert.throws(() => makeShareable(gpxOf([short]), { trim: 460 }), refused('route_too_short')); // 900 m long: every point is within 460 m of an end
    const result = makeShareable(gpxOf([short]), { trim: 200 });
    assert.ok(result.points.output > 0 && result.points.output < 31);
    assert.ok(nearest(short[0], result.segments.flat()) >= 200);
  });

  it('gives a plain copy, never the original waypoints, author, device or extensions', () => {
    const extra =
      '<metadata><author><name>Tom Example</name><email id="tom" domain="example.com"/></author></metadata>' +
      '<wpt lat="48.8584" lon="2.2945"><name>Home</name></wpt>';
    const track = line(destination(NULL_ISLAND, 0, 3000), 0, 8000, 80, { every: 4 });
    const withExtensions = gpxOf([track], extra).replace(/<time>/g, '<extensions><hr>150</hr></extensions><time>');
    const { gpx } = makeShareable(withExtensions);
    assert.ok(gpx.includes('<trkpt'));
    for (const leaked of [
      'Home',
      'example.com',
      'Tom Example',
      'Test Device 9',
      '<wpt',
      '<extensions',
      'hr>',
      '<metadata',
    ]) {
      assert.ok(!gpx.includes(leaked), leaked);
    }
    assert.ok(gpx.includes('creator="gpx-privacy"'));
  });

  it('keeps the file name by default, and sets or drops it on request', () => {
    const xml = gpxOf([line(NULL_ISLAND, 0, 5000, 50)], '', 'Home to work');
    assert.equal(makeShareable(xml).name, 'Home to work');
    assert.equal(makeShareable(xml, { name: 'Morning ride' }).name, 'Morning ride');
    const nameless = makeShareable(xml, { name: null });
    assert.equal(nameless.name, undefined);
    assert.ok(!nameless.gpx.includes('<name>'));
  });

  it('reports the whole track in stats and what is shared in shared', () => {
    const result = makeShareable(gpxOf([line(NULL_ISLAND, 0, 10_000, 200)]));
    assert.ok(Math.abs(result.stats.distance - 10_000) < 1);
    assert.ok(Math.abs(result.shared.distance - 9000) <= 100);
    assert.equal(result.stats.points, 201);
    assert.equal(result.shared.points, result.points.output);
  });

  it('leaves the times out on request, and shared has no duration', () => {
    const xml = gpxOf([line(NULL_ISLAND, 0, 10_000, 100, { ele: (i) => i, every: 10 })]);
    const kept = makeShareable(xml);
    assert.ok(kept.gpx.includes('<time>'));
    assert.equal(kept.shared.duration, 990 - 100);
    const dropped = makeShareable(xml, { dropTimes: true });
    assert.ok(!dropped.gpx.includes('<time>'));
    assert.ok(dropped.gpx.includes('<ele>'));
    assert.equal(dropped.shared.duration, null);
    assert.equal(dropped.stats.duration, 1000); // the whole recorded track keeps its figures
    assert.ok(dropped.segments.flat().every((p) => p.time === undefined && p.ele !== undefined));
    assert.deepEqual(
      dropped.segments.flat().map((p) => [p.lat, p.lon]),
      kept.segments.flat().map((p) => [p.lat, p.lon]),
    );
  });

  it('works without elevation: no climb, no heights in the file', () => {
    const result = makeShareable(gpxOf([line(NULL_ISLAND, 0, 10_000, 100, { every: 10 })]));
    assert.equal(result.stats.climb, null);
    assert.equal(result.stats.descent, null);
    assert.ok(!result.gpx.includes('<ele>'));
    assert.ok(result.gpx.includes('<time>'));
  });

  it('works without times: no duration, no times in the file', () => {
    const result = makeShareable(gpxOf([line(NULL_ISLAND, 0, 10_000, 100, { ele: (i) => i * 3 })]));
    assert.equal(result.stats.duration, null);
    assert.ok(result.stats.climb !== null && result.stats.climb > 250);
    assert.ok(!result.gpx.includes('<time>'));
    assert.ok(result.gpx.includes('<ele>'));
  });

  it('works without elevation and without times', () => {
    const result = makeShareable(gpxOf([line(NULL_ISLAND, 0, 10_000, 100)]));
    assert.deepEqual([result.stats.climb, result.stats.descent, result.stats.duration], [null, null, null]);
    assert.equal(parseGpx(result.gpx).segments.flat().length, result.points.output);
  });

  it('keeps multi-segment tracks as separate segments and leaves the gap out of the distance', () => {
    const a = line(NULL_ISLAND, 90, 6000, 60, { every: 10, from: '2026-05-01T08:00:00Z' });
    const b = line(destination(NULL_ISLAND, 0, 20_000), 90, 6000, 60, { every: 10, from: '2026-05-01T11:00:00Z' });
    const result = makeShareable(gpxOf([a, b]));
    assert.equal(result.segments.length, 2);
    assert.equal(parseGpx(result.gpx).segments.length, 2);
    assert.ok(Math.abs(result.stats.distance - 12_000) < 1);
    assert.equal(result.stats.duration, 1200);
    assert.ok(nearest(a[0], result.segments.flat()) >= 500);
    assert.ok(nearest(b[60], result.segments.flat()) >= 500);
  });

  it('reads a planned route when the file has no track', () => {
    const pts = line(NULL_ISLAND, 0, 5000, 50);
    const xml = `<gpx version="1.1"><rte>${pts.map((p) => `<rtept lat="${p.lat}" lon="${p.lon}"/>`).join('')}</rte></gpx>`;
    assert.ok(makeShareable(xml).points.output > 0);
  });

  it('takes its limits from the options', () => {
    const xml = gpxOf([line(NULL_ISLAND, 0, 20_000, 1000)]);
    assert.equal(makeShareable(xml, { maxPoints: 50 }).points.output, 50);
    assert.ok(nearest(destination(NULL_ISLAND, 0, 0), makeShareable(xml, { trim: 2000 }).segments.flat()) >= 2000);
    assert.throws(() => makeShareable(xml, { maxBytes: 100 }), refused('too_large'));
    assert.ok(makeShareable(xml, { creator: 'app' }).gpx.includes('creator="app"'));
  });

  it('refuses a file without a recorded track', () => {
    const one = gpxOf([[{ lat: 1, lon: 1 }]]);
    assert.throws(() => makeShareable(one), refused('empty_route'));
    assert.throws(() => makeShareable('<gpx><wpt lat="1" lon="1"/></gpx>'), refused('empty_route'));
  });

  it('refuses text that is not GPX', () => {
    assert.throws(() => makeShareable('<html><body>hi</body></html>'), refused('invalid_gpx'));
  });
});
