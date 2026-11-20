import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stats } from '../src/index.ts';
import type { TrackPoint } from '../src/index.ts';
import { circle, line, NULL_ISLAND } from './fixtures.ts';

const heights = (...eles: number[]): TrackPoint[] => eles.map((ele, i) => ({ lat: i * 1e-4, lon: 0, ele }));

describe('stats distance', () => {
  it('measures a degree of latitude as about 111.2 km', () => {
    const { distance } = stats([
      { lat: 0, lon: 0 },
      { lat: 1, lon: 0 },
    ]);
    assert.ok(Math.abs(distance - 111_195) < 5);
  });

  it('measures a straight track and a loop', () => {
    assert.ok(Math.abs(stats(line(NULL_ISLAND, 30, 12_345, 100)).distance - 12_345) < 1);
    const loop = stats(circle(NULL_ISLAND, 16_000, 2000)).distance;
    assert.ok(Math.abs(loop - 2 * Math.PI * 16_000) / loop < 0.001);
  });

  it('leaves the gap between segments out', () => {
    const a = line(NULL_ISLAND, 0, 1000, 10);
    const b = line({ lat: 10, lon: 10 }, 0, 2000, 10);
    assert.ok(Math.abs(stats([a, b]).distance - 3000) < 1);
  });

  it('counts the points and gives zeros for an empty track', () => {
    assert.equal(stats(line(NULL_ISLAND, 0, 100, 9)).points, 10);
    assert.deepEqual(stats([]), { points: 0, distance: 0, climb: null, descent: null, duration: null });
  });
});

describe('stats climb and descent', () => {
  it('ignores GPS noise inside the threshold', () => {
    const noisy = heights(100, 103, 98, 104, 99, 105, 100, 104, 96);
    assert.deepEqual([stats(noisy).climb, stats(noisy).descent], [0, 0]);
  });

  it('counts a steady climb in steps of more than the threshold', () => {
    // 0, 2, 4 ... 100: the running height moves each time it is more than 5 m away, that is every 6 m: 16 moves.
    const ramp = heights(...Array.from({ length: 51 }, (_, i) => i * 2));
    assert.deepEqual([stats(ramp).climb, stats(ramp).descent], [96, 0]);
  });

  it('counts climbs and descents separately', () => {
    const result = stats(heights(100, 120, 90, 150));
    assert.equal(result.climb, 20 + 60);
    assert.equal(result.descent, 30);
  });

  it('takes the threshold from the options', () => {
    const track = heights(0, 3, 6, 9);
    assert.equal(stats(track).climb, 6); // 0 -> 6 (>5), then 6 -> 9 is within the threshold
    assert.equal(stats(track, { climbThreshold: 1 }).climb, 9);
    assert.equal(stats(track, { climbThreshold: 20 }).climb, 0);
  });

  it('is null, not zero, without heights', () => {
    const result = stats(line(NULL_ISLAND, 0, 1000, 10));
    assert.equal(result.climb, null);
    assert.equal(result.descent, null);
  });

  it('skips points that have no height', () => {
    const track: TrackPoint[] = [
      { lat: 0, lon: 0, ele: 0 },
      { lat: 0.001, lon: 0 },
      { lat: 0.002, lon: 0, ele: 50 },
    ];
    assert.equal(stats(track).climb, 50);
  });

  it('restarts the running height in every segment', () => {
    // 0 -> 100 in one segment, then a new segment starting at 100: the jump between segments is not a climb.
    assert.equal(stats([heights(0, 100), heights(100, 100)]).climb, 100);
  });
});

describe('stats duration', () => {
  it('is the time between the first and the last point', () => {
    const track = line(NULL_ISLAND, 0, 1000, 60, { every: 60 });
    assert.equal(stats(track).duration, 3600);
  });

  it('adds up segments without the pause between them', () => {
    const a = line(NULL_ISLAND, 0, 1000, 10, { every: 30, from: '2026-05-01T08:00:00Z' }); // 300 s
    const b = line(NULL_ISLAND, 0, 1000, 10, { every: 30, from: '2026-05-01T12:00:00Z' }); // 300 s, four hours later
    assert.equal(stats([a, b]).duration, 600);
  });

  it('is null when there are no times, one time, or none that can be read', () => {
    assert.equal(stats(line(NULL_ISLAND, 0, 1000, 10)).duration, null);
    assert.equal(stats([{ lat: 0, lon: 0, time: '2026-05-01T08:00:00Z' }]).duration, null);
    assert.equal(
      stats([
        { lat: 0, lon: 0, time: 'yesterday' },
        { lat: 1, lon: 0, time: 'today' },
      ]).duration,
      null,
    );
  });

  it('ignores unreadable times and does not depend on point order', () => {
    const track: TrackPoint[] = [
      { lat: 0, lon: 0, time: '2026-05-01T09:00:00Z' },
      { lat: 1, lon: 0, time: 'garbage' },
      { lat: 2, lon: 0, time: '2026-05-01T08:00:00Z' },
    ];
    assert.equal(stats(track).duration, 3600);
  });
});
