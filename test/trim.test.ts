import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { haversine, trimEnds } from '../src/index.ts';
import { circle, destination, EIFFEL_TOWER, jitter, line, NULL_ISLAND, nearest } from './fixtures.ts';

describe('trimEnds', () => {
  it('removes everything within the radius of the start and of the end', () => {
    const track = line(NULL_ISLAND, 90, 10_000, 100); // 100 m steps
    const [kept] = trimEnds(track, 500);
    assert.ok(nearest(track[0], kept) >= 500);
    assert.ok(nearest(track[100], kept) >= 500);
    assert.ok(kept.length > 85 && kept.length < 95);
  });

  it('hides everything within the radius of home, even after minutes of GPS jitter there', () => {
    const ride = line(destination(EIFFEL_TOWER, 0, 30), 0, 20_000, 400); // 50 m steps, due north
    const track = [...jitter(EIFFEL_TOWER, 600), ...ride];
    const kept = trimEnds(track, 500).flat();
    assert.ok(kept.length > 0);
    assert.ok(nearest(EIFFEL_TOWER, kept) >= 500);
  });

  it('hides a loop that passes the start in the middle of the ride, splitting the segment', () => {
    // out 3 km, back past the start to 3 km the other way, then home: the middle crosses the zone around the start.
    const out = line(NULL_ISLAND, 90, 3000, 60);
    const back = line(out[60], 270, 6000, 120);
    const home = line(back[120], 90, 3000, 60);
    const kept = trimEnds([[...out, ...back.slice(1), ...home.slice(1)]], 500);
    assert.equal(kept.length, 2); // the out-and-back before the start, the out-and-back after it
    assert.ok(nearest(NULL_ISLAND, kept.flat()) >= 500);
  });

  it('returns nothing for a track shorter than the radius', () => {
    assert.deepEqual(trimEnds(line(NULL_ISLAND, 0, 400, 8), 500), []);
  });

  it('returns nothing when every point is within the radius of the start or the end', () => {
    // 800 m long: each point is within 500 m of one end or the other.
    assert.deepEqual(trimEnds(line(NULL_ISLAND, 0, 800, 16), 500), []);
  });

  it('keeps a track that clears the radius from both ends', () => {
    assert.ok(trimEnds(line(NULL_ISLAND, 0, 1200, 24), 500).flat().length > 0);
  });

  it('cuts a loop that ends where it started down to its far side', () => {
    const loop = circle(NULL_ISLAND, 2000, 360);
    const kept = trimEnds(loop, 500);
    assert.equal(kept.length, 1);
    assert.ok(nearest(loop[0], kept[0]) >= 500);
    assert.ok(kept[0].length < loop.length);
  });

  it('measures from the very first and the very last point across segments', () => {
    const a = line(NULL_ISLAND, 90, 2000, 20);
    const b = line(destination(NULL_ISLAND, 0, 50_000), 90, 2000, 20); // far away: a gap between segments
    const kept = trimEnds([a, b], 500);
    assert.equal(kept.length, 2);
    assert.ok(nearest(a[0], kept[0]) >= 500);
    assert.ok(nearest(b[20], kept[1]) >= 500);
    // The far end of the first segment and the start of the second are not "ends" of the ride: they stay.
    assert.ok(kept[0].some((p) => haversine(p, a[20]) < 1));
    assert.ok(kept[1].some((p) => haversine(p, b[0]) < 1));
  });

  it('accepts one flat list of points and always answers in segments', () => {
    const track = line(NULL_ISLAND, 0, 5000, 50);
    assert.deepEqual(trimEnds(track, 500), trimEnds([track], 500));
  });

  it('keeps height and time on the points it keeps', () => {
    const track = line(NULL_ISLAND, 0, 5000, 50, { ele: (i) => i, every: 10 });
    const kept = trimEnds(track).flat();
    assert.ok(kept.length > 0);
    assert.ok(kept.every((p) => p.ele !== undefined && p.time !== undefined));
  });

  it('uses 500 m by default and hides nothing at 0', () => {
    const track = line(NULL_ISLAND, 0, 5000, 50);
    assert.deepEqual(trimEnds(track), trimEnds(track, 500));
    assert.equal(trimEnds(track, 0).flat().length, track.length);
  });

  it('answers nothing for nothing', () => {
    assert.deepEqual(trimEnds([]), []);
    assert.deepEqual(trimEnds([[]]), []);
  });

  it('refuses a radius that would silently hide nothing', () => {
    assert.throws(() => trimEnds([], -1), RangeError);
    assert.throws(() => trimEnds([], Number.NaN), RangeError);
  });
});
