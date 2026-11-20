import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { simplify } from '../src/index.ts';
import { circle, line, maxDeviation, NULL_ISLAND } from './fixtures.ts';

describe('simplify', () => {
  it('returns a track at or under the limit untouched', () => {
    const track = line(NULL_ISLAND, 0, 1000, 99);
    assert.equal(simplify(track, { maxPoints: 100 }), track);
    assert.equal(simplify(track), track); // 100 points, default limit 500
  });

  it('keeps at most maxPoints, both ends, and the original order', () => {
    const track = circle({ lat: 20, lon: 10 }, 3000, 2000);
    const out = simplify(track, { maxPoints: 60 });
    assert.equal(out.length, 60);
    assert.equal(out[0], track[0]);
    assert.equal(out[59], track[2000]);
    const indexes = out.map((p) => track.indexOf(p));
    assert.ok(indexes.every((i) => i >= 0));
    assert.deepEqual(
      indexes,
      [...indexes].sort((a, b) => a - b),
    );
  });

  it('keeps the shape of the track', () => {
    const track = circle({ lat: 20, lon: 10 }, 3000, 2000);
    // 60 chords around a 3 km circle never stray further than the sagitta of one chord (about 4 m), give or take.
    assert.ok(maxDeviation(track, simplify(track, { maxPoints: 60 })) < 25);
    assert.ok(maxDeviation(track, simplify(track, { maxPoints: 200 })) < 3);
  });

  it('keeps the corners of a bend when only a few points are allowed', () => {
    const a = line(NULL_ISLAND, 0, 1000, 250);
    const b = line(a[250], 90, 1500, 250);
    const c = line(b[250], 180, 600, 250);
    const track = [...a, ...b.slice(1), ...c.slice(1)];
    const out = simplify(track, { maxPoints: 4 });
    assert.deepEqual(out, [a[0], a[250], b[250], c[250]]);
  });

  it('collapses a straight line to its two ends', () => {
    const track = line(NULL_ISLAND, 45, 10_000, 1000);
    assert.deepEqual(simplify(track, { maxPoints: 2 }), [track[0], track[1000]]);
  });

  it('keeps height and time on the points it keeps', () => {
    const track = circle(NULL_ISLAND, 2000, 1000, { ele: (i) => i, every: 3 });
    for (const p of simplify(track, { maxPoints: 50 })) assert.ok(p.ele !== undefined && p.time !== undefined);
  });

  it('keeps the segments of a multi-segment track apart, with at most maxPoints in total', () => {
    const a = circle(NULL_ISLAND, 2000, 800);
    const b = line({ lat: 1, lon: 1 }, 90, 5000, 600);
    const out = simplify([a, b], { maxPoints: 100 });
    assert.equal(out.length, 2);
    assert.equal(out[0].length + out[1].length, 100);
    assert.equal(out[0][0], a[0]);
    assert.equal(out[0].at(-1), a[800]);
    assert.equal(out[1][0], b[0]);
    assert.equal(out[1].at(-1), b[600]);
  });

  it('returns the same shape it was given', () => {
    const track = circle(NULL_ISLAND, 2000, 1000);
    assert.ok(!Array.isArray(simplify(track, { maxPoints: 30 })[0]));
    assert.ok(Array.isArray(simplify([track], { maxPoints: 30 })[0]));
    assert.deepEqual(simplify([]), []);
  });

  it('keeps every point with an infinite limit', () => {
    const track = circle(NULL_ISLAND, 2000, 1000);
    assert.equal(simplify(track, { maxPoints: Infinity }), track);
  });

  it('refuses a limit that cannot hold a line', () => {
    assert.throws(() => simplify([], { maxPoints: 1 }), RangeError);
    assert.throws(() => simplify([], { maxPoints: Number.NaN }), RangeError);
  });

  it('handles a hostile 300,000-point zigzag in a few seconds at most', () => {
    const zigzag = Array.from({ length: 300_000 }, (_, i) => ({ lat: 47 + i * 1e-6, lon: 11 + (i % 2) * 1e-4 }));
    const started = performance.now();
    const out = simplify(zigzag);
    assert.ok(out.length <= 500);
    assert.ok(performance.now() - started < 3000);
  });

  it('handles thousands of tiny segments without blowing up', () => {
    const segments = Array.from({ length: 20_000 }, (_, i) => [
      { lat: i * 1e-4, lon: 0 },
      { lat: i * 1e-4 + 1e-5, lon: 0 },
    ]);
    const started = performance.now();
    const out = simplify(segments, { maxPoints: 500 });
    assert.ok(out.flat().length <= 500);
    assert.ok(performance.now() - started < 3000);
  });
});
