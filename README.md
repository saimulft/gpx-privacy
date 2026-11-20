# gpx-privacy

Make GPX tracks safe to share.

[![npm version](https://img.shields.io/npm/v/gpx-privacy)](https://www.npmjs.com/package/gpx-privacy)
[![license](https://img.shields.io/npm/l/gpx-privacy)](https://www.npmjs.com/package/gpx-privacy)
[![node](https://img.shields.io/node/v/gpx-privacy)](https://www.npmjs.com/package/gpx-privacy)

A recorded ride or run starts and ends at your front door. gpx-privacy hides the first and last 500 m of a track (wherever along the track they recur), simplifies what is left, works out the distance, climb and duration, and writes a minimal GPX file with nothing but positions, heights and times. It is a library and a command-line tool with one runtime dependency.

[@tmcw/togeojson](https://github.com/placemark/togeojson) and [gpxparser](https://github.com/Luuka/GPXParser) read GPX into GeoJSON or plain objects, and leave the privacy step to you. gpx-privacy starts where they stop: it trims the ends, thins the line, and returns a clean file you can publish.

## Install

```sh
npm install gpx-privacy
```

Or run it without installing:

```sh
npx gpx-privacy ride.gpx -o ride-public.gpx
```

Node 20 or newer. ESM only. The library uses no Node APIs, so it also runs in browsers; only the CLI reads and writes files.

## CLI

```
gpx-privacy <in.gpx> [-o out.gpx] [--trim 500] [--max-points N] [--drop-times] [--stats] [--json]
```

| Option                | Meaning                                                       | Default |
| --------------------- | ------------------------------------------------------------- | ------- |
| `-o, --output <file>` | Write the GPX to this file instead of stdout                  | stdout  |
| `--trim <metres>`     | Hide this far around the start and the end. `0` hides nothing | `500`   |
| `--max-points <n>`    | Keep at most this many points                                 | `500`   |
| `--drop-times`        | Leave the timestamps out of the GPX                           |         |
| `--stats`             | Print distance, climb, descent and duration to stderr         |         |
| `--json`              | Print the stats as JSON to stderr (implies `--stats`)         |         |
| `-v, --version`       | Print the version                                             |         |
| `-h, --help`          | Print the help                                                |         |

The GPX goes to stdout, or to `-o`. Stats go to stderr whenever `-o`, `--stats` or `--json` is given, so a pipe only ever carries GPX. The stats describe the whole recorded track, ends included.

Trim a ride, write the public copy, and see what happened:

```
$ gpx-privacy ride.gpx -o ride-public.gpx
gpx-privacy: ride.gpx -> ride-public.gpx
  Trimmed   500 m from the start and the end
  Points    2,001 -> 500
  Distance  43.98 km
  Climb     343 m
  Descent   344 m
  Duration  1:40:00
```

The file it wrote:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="gpx-privacy" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>Morning ride</name>
<trkseg>
<trkpt lat="48.858236" lon="2.301408"><ele>39.5</ele><time>2026-05-02T07:31:09.000Z</time></trkpt>
<trkpt lat="48.858173" lon="2.302606"><ele>37.4</ele><time>2026-05-02T07:31:21.000Z</time></trkpt>
...
```

Machine-readable stats, with a 300 m trim and 300 points, and the GPX redirected:

```
$ gpx-privacy ride.gpx --trim 300 --max-points 300 --json > ride-public.gpx
{
  "input": "ride.gpx",
  "output": null,
  "name": "Morning ride",
  "trim": 300,
  "maxPoints": 300,
  "points": { "input": 2001, "output": 300 },
  "stats": { "points": 2001, "distance": 43982.3, "climb": 343.4, "descent": 344.3, "duration": 6000 },
  "shared": { "points": 300, "distance": 43365.6, "climb": 369.2, "descent": 376.2, "duration": 5916 }
}
```

`stats` is the whole recorded track. `shared` is what the output file contains. Distances are in metres, durations in seconds, and `null` means the file has no heights or no times.

| Exit code | Meaning                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| `0`       | Done                                                                                                                 |
| `1`       | The input is missing, unreadable, over 10 MiB, not GPX, has fewer than two points, or nothing is left after the trim |
| `2`       | Wrong usage: unknown option, missing or extra file, a bad number, or `-o` pointing at the input file                 |

The CLI never overwrites its input.

## API

```ts
import { makeShareable } from 'gpx-privacy';

const { gpx, stats, shared, points } = makeShareable(xml, { trim: 500, maxPoints: 500 });
// gpx: the clean document, stats.distance: metres of the whole ride, points: { input: 2001, output: 500 }
```

Every function takes either one list of points or a list of segments (a track is split into segments when the recorder paused). A point is `{ lat, lon, ele?, time? }`: degrees, metres, and the time string as written in the file.

### `makeShareable(xml, options?)`

Parse, trim, simplify and write in one call. Throws a `GpxError` for an unusable file.

| Option           | Meaning                                                       | Default       |
| ---------------- | ------------------------------------------------------------- | ------------- |
| `trim`           | Metres hidden around the start and the end; `0` hides nothing | `500`         |
| `maxPoints`      | Most points kept, over all segments                           | `500`         |
| `maxBytes`       | Largest document accepted                                     | `10485760`    |
| `climbThreshold` | Metres of height change treated as GPS noise                  | `5`           |
| `name`           | Output track name: a string, or `null` for none               | the file's    |
| `creator`        | The `creator` attribute of the output                         | `gpx-privacy` |
| `precision`      | Decimal places kept in latitude and longitude                 | `6`           |

Returns `{ gpx, name?, segments, stats, shared, points }`: the document, the points written (as segments), the stats of the whole track, the stats of what was written, and `{ input, output }` point counts.

### `parseGpx(xml, options?)`

```ts
const { name, segments } = parseGpx(xml, { maxBytes: 20 * 1024 * 1024 });
```

Reads every segment of every `<trk>`, or the `<rte>` routes when there are no track points. Waypoints are ignored, namespace prefixes are fine, points with unreadable coordinates are skipped, and a file cut off before its closing tags still yields the points before the cut. Throws `GpxError` with code `invalid_gpx` or `too_large`.

`looksLikeGpx(text)` is a cheap check that a text is XML with a `<gpx>` root, without parsing it.

### `trimEnds(points, meters = 500)`

```ts
const hidden = trimEnds(segments, 500); // TrackPoint[][]
```

Removes every point within `meters` of the first point or the last point of the track, wherever it occurs: GPS jitter at the door, or a loop that passes home halfway through. A segment that crosses the zone is split. A track shorter than the radius returns `[]`. Throws `RangeError` for a negative or `NaN` radius, so the trim never silently does nothing.

### `simplify(points, options?)`

```ts
const lighter = simplify(segments, { maxPoints: 200 });
```

Reduces the track to at most `maxPoints` (default 500, minimum 2, `Infinity` keeps everything), keeping its shape and the ends of every segment. Extra fields on the points are kept. The result has the shape of the input: a list in, a list out; segments in, segments out.

### `stats(points, options?)`

```ts
const { distance, climb, descent, duration } = stats(segments, { climbThreshold: 5 });
```

| Field      | Meaning                                                                       |
| ---------- | ----------------------------------------------------------------------------- |
| `points`   | Number of points                                                              |
| `distance` | Metres travelled, gaps between segments left out                              |
| `climb`    | Metres climbed, or `null` when no point has a height                          |
| `descent`  | Metres descended, or `null` when no point has a height                        |
| `duration` | Seconds from first to last time of each segment, summed; `null` without times |

### `toGpx(points, options?)`

```ts
const xml = toGpx(segments, { name: 'Sunday ride', precision: 5 });
```

Writes a minimal GPX 1.1 document: one `<trkseg>` per segment, `<ele>` and `<time>` only where the point has them. No waypoints, author, device or extension data is ever written. Options: `name`, `creator`, `precision`, `dropTimes` (as above).

### Also exported

- `haversine(a, b)`: great-circle distance in metres between two `{ lat, lon }`.
- `DEFAULTS`: `{ trimMeters, maxPoints, maxBytes, climbThreshold }`.
- `GpxError`: has a `code` of `invalid_gpx`, `too_large`, `empty_route` (fewer than two points) or `route_too_short` (nothing left after the trim).
- Types: `TrackPoint`, `ParsedGpx`, `Stats`, `LatLon`, `ParseOptions`, `SimplifyOptions`, `StatsOptions`, `WriteOptions`, `ShareableOptions`, `ShareableResult`, `GpxErrorCode`.

## How it works

- **Parsing is safe by construction.** The XML parser runs with entity processing off, so a DOCTYPE cannot expand entities (no XXE, no billion laughs); only the five predefined entities and character references are decoded in names. Documents over 10 MiB are refused before parsing.
- **The trim is a radius, not a count.** Every point within 500 m of the first or last point is removed, anywhere on the track, so a long wait at home or a pass by the door halfway through never shows it. The radius does not shrink for short tracks: a track that never gets 500 m away from both ends is refused rather than published whole.
- **Climb uses a hysteresis.** A running height moves only when a reading is more than 5 m away from it, and only that move counts. GPS noise of a few metres adds nothing; a real hill does.
- **Simplification keeps the shape.** Douglas-Peucker runs once to rank every point by how much of the line's shape it holds, then the best `maxPoints` are kept in order. Tracks of thousands of points are first thinned evenly by distance, so a hostile 300,000-point zigzag is handled in well under a second.
- **The output is rebuilt, not edited.** The file is written from the kept points, so nothing from the original (waypoints, author, device, extensions) can carry over.

## Limits

- A trim hides where a ride starts and ends. It does not hide a workplace or a friend's house you pass, and a track that leaves 500 m from your door still shows the direction and the neighbourhood. Choose a larger `trim` if that matters. It is not anonymisation.
- Heights and times are kept unless you ask otherwise. Times show when you leave and arrive, and a habit is visible over many rides. Pass `dropTimes: true` (`--drop-times` on the command line) to leave them out. Heights are always kept.
- The stats of the whole track include the part that was hidden, so the distance and duration reveal the true length of the ride. Use `shared` or `makeShareable(...).shared` for the figures of the file you publish.
- 500 points is coarse for a long ride. Raise `--max-points` when you want more detail.
- Distance is flat 2D haversine on a sphere of radius 6,371,008.8 m, within roughly 0.5% of an ellipsoidal figure, and ignores height. Climb and descent will not match the numbers a given app or watch reports.
- Simplification works on a local flat approximation scaled by latitude. It suits rides and runs, not tracks that span a continent or cross the antimeridian.
- Tracks and routes only: waypoints are ignored. GPX in, GPX out; TCX, FIT and KML are not read.
- The CLI refuses files over 10 MiB; the library takes `maxBytes`.

## License

MIT © Saimul Islam
