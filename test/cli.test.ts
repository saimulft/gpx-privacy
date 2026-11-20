import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseGpx } from '../src/index.ts';
import { circle, EIFFEL_TOWER, gpxOf, line, NULL_ISLAND, nearest } from './fixtures.ts';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string })
  .version;

let dir: string;
const file = (name: string) => join(dir, name);
const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd: dir });

// A 31 km loop around the Eiffel Tower area, 1,200 points, with heights and times.
const loop = circle(EIFFEL_TOWER, 5000, 1200, { ele: (i) => 40 + 30 * Math.sin((i / 1200) * 6 * Math.PI), every: 5 });

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'gpx-privacy-test-'));
  writeFileSync(file('ride.gpx'), gpxOf([loop], '', 'Test loop'));
  writeFileSync(file('flat.gpx'), gpxOf([line(NULL_ISLAND, 90, 20_000, 400)]));
  writeFileSync(file('short.gpx'), gpxOf([line(NULL_ISLAND, 0, 600, 12)]));
  writeFileSync(file('page.gpx'), '<html><body>not a track</body></html>');
  writeFileSync(file('huge.gpx'), `<gpx>${' '.repeat(11 * 1024 * 1024)}</gpx>`);
});
after(() => rmSync(dir, { recursive: true, force: true }));

describe('cli output', () => {
  it('writes the shareable GPX to stdout and nothing to stderr', () => {
    const { status, stdout, stderr } = run('ride.gpx');
    assert.equal(status, 0);
    assert.equal(stderr, '');
    const { name, segments } = parseGpx(stdout);
    assert.equal(name, 'Test loop');
    const points = segments.flat();
    assert.ok(points.length > 2 && points.length <= 500);
    assert.ok(nearest(loop[0], points) >= 500);
    assert.ok(!stdout.includes('Test Device 9'));
  });

  it('writes to the -o file, keeps stdout empty and prints a summary to stderr', () => {
    const { status, stdout, stderr } = run('ride.gpx', '-o', 'public.gpx');
    assert.equal(status, 0);
    assert.equal(stdout, '');
    assert.equal(parseGpx(readFileSync(file('public.gpx'), 'utf8')).name, 'Test loop');
    assert.match(stderr, /^gpx-privacy: ride\.gpx -> public\.gpx\n/);
    assert.match(stderr, /Trimmed\s+500 m from the start and the end/);
    assert.match(stderr, /Points\s+1,201 -> \d+/);
    assert.match(stderr, /Distance\s+31\.4\d km/);
    assert.match(stderr, /Climb\s+\d+ m/);
    assert.match(stderr, /Descent\s+\d+ m/);
    assert.match(stderr, /Duration\s+1:40:00/);
  });

  it('prints stats to stderr with --stats while the GPX stays on stdout', () => {
    const { status, stdout, stderr } = run('ride.gpx', '--stats');
    assert.equal(status, 0);
    assert.ok(stdout.startsWith('<?xml'));
    assert.match(stderr, /ride\.gpx -> stdout/);
    assert.match(stderr, /Distance/);
  });

  it('says so when there is no elevation or no times', () => {
    const { stderr } = run('flat.gpx', '--stats');
    assert.match(stderr, /Climb\s+n\/a \(no elevation\)/);
    assert.match(stderr, /Descent\s+n\/a \(no elevation\)/);
    assert.match(stderr, /Duration\s+n\/a \(no times\)/);
  });

  it('prints the stats as JSON with --json', () => {
    const { status, stdout, stderr } = run('ride.gpx', '--json', '-o', 'out.gpx');
    assert.equal(status, 0);
    assert.equal(stdout, '');
    const report = JSON.parse(stderr) as {
      input: string;
      output: string;
      name: string;
      trim: number;
      maxPoints: number;
      points: { input: number; output: number };
      stats: { points: number; distance: number; climb: number; descent: number; duration: number };
      shared: { points: number; distance: number };
    };
    assert.equal(report.input, 'ride.gpx');
    assert.equal(report.output, 'out.gpx');
    assert.equal(report.name, 'Test loop');
    assert.deepEqual([report.trim, report.maxPoints], [500, 500]);
    assert.equal(report.points.input, 1201);
    assert.equal(report.stats.points, 1201);
    assert.equal(report.stats.duration, 6000);
    assert.ok(Math.abs(report.stats.distance - 2 * Math.PI * 5000) < 100);
    assert.ok(report.stats.climb > 0 && report.stats.descent > 0);
    assert.ok(report.shared.distance < report.stats.distance);
    assert.equal(report.shared.points, report.points.output);
  });

  it('keeps stdout pure GPX with --json, and reports null for what the file does not have', () => {
    const { stdout, stderr } = run('flat.gpx', '--json');
    assert.ok(stdout.startsWith('<?xml'));
    const report = JSON.parse(stderr) as { output: null; name: null; stats: { climb: null; duration: null } };
    assert.deepEqual([report.output, report.name, report.stats.climb, report.stats.duration], [null, null, null, null]);
  });

  it('respects --trim', () => {
    const { stdout } = run('flat.gpx', '--trim', '3000');
    assert.ok(nearest(NULL_ISLAND, parseGpx(stdout).segments.flat()) >= 3000);
    const none = parseGpx(run('flat.gpx', '--trim', '0').stdout).segments.flat();
    assert.ok(nearest(NULL_ISLAND, none) < 1);
  });

  it('respects --max-points', () => {
    assert.equal(parseGpx(run('ride.gpx', '--max-points', '40').stdout).segments.flat().length, 40);
    assert.equal(parseGpx(run('ride.gpx', '--max-points=40').stdout).segments.flat().length, 40);
  });

  it('leaves the times out with --drop-times, and says so in the JSON', () => {
    const { status, stdout, stderr } = run('ride.gpx', '--drop-times', '--json');
    assert.equal(status, 0);
    assert.ok(!stdout.includes('<time>'));
    assert.ok(stdout.includes('<ele>'));
    const report = JSON.parse(stderr) as {
      dropTimes: boolean;
      stats: { duration: number };
      shared: { duration: null };
    };
    assert.equal(report.dropTimes, true);
    assert.equal(report.stats.duration, 6000);
    assert.equal(report.shared.duration, null);
    assert.ok(run('ride.gpx').stdout.includes('<time>'));
  });

  it('prints help and the version', () => {
    const help = run('--help');
    assert.equal(help.status, 0);
    assert.match(
      help.stdout,
      /Usage:\n {2}gpx-privacy <in\.gpx> \[-o out\.gpx\] \[--trim 500\] \[--max-points N\] \[--drop-times\] \[--stats\] \[--json\]/,
    );
    assert.match(help.stdout, /default 500/);
    assert.equal(run('-h').stdout, help.stdout);
    assert.deepEqual([run('--version').stdout, run('-v').status], [`${VERSION}\n`, 0]);
  });
});

describe('cli usage errors (exit 2)', () => {
  const usage = (args: string[], message: RegExp) => {
    const { status, stdout, stderr } = run(...args);
    assert.equal(status, 2, `gpx-privacy ${args.join(' ')}`);
    assert.equal(stdout, '');
    assert.match(stderr, message);
    assert.match(stderr, /--help/);
  };

  it('needs exactly one input file', () => {
    usage([], /missing input file/);
    usage(['ride.gpx', 'flat.gpx'], /only one input file/);
  });

  it('refuses unknown options and options without a value', () => {
    usage(['ride.gpx', '--nope'], /nope/);
    usage(['ride.gpx', '--trim'], /trim/);
    usage(['ride.gpx', '-o'], /output|-o/);
  });

  it('refuses numbers that make no sense', () => {
    usage(['ride.gpx', '--trim', 'far'], /--trim must be/);
    usage(['ride.gpx', '--trim=-5'], /--trim must be/);
    usage(['ride.gpx', '--trim', ''], /--trim must be/);
    usage(['ride.gpx', '--max-points', '1'], /--max-points must be/);
    usage(['ride.gpx', '--max-points', '2.5'], /--max-points must be/);
    usage(['ride.gpx', '--max-points', 'many'], /--max-points must be/);
  });

  it('never overwrites the input file', () => {
    const before = readFileSync(file('ride.gpx'), 'utf8');
    usage(['ride.gpx', '-o', 'ride.gpx'], /overwritten/);
    usage(['ride.gpx', '-o', './ride.gpx'], /overwritten/);
    assert.equal(readFileSync(file('ride.gpx'), 'utf8'), before);
  });
});

describe('cli unusable input (exit 1)', () => {
  const unusable = (name: string, message: RegExp) => {
    const { status, stdout, stderr } = run(name);
    assert.equal(status, 1, name);
    assert.equal(stdout, '');
    assert.match(stderr, message);
  };

  it('reports a file that does not exist', () =>
    unusable('missing.gpx', /gpx-privacy: cannot use missing\.gpx: .*ENOENT/));
  it('reports a file that is not GPX', () => unusable('page.gpx', /cannot use page\.gpx: .*not a GPX document/));
  it('reports a file over the size limit', () => unusable('huge.gpx', /cannot use huge\.gpx: .*larger than the limit/));
  it('reports a track that is gone once its ends are hidden', () =>
    unusable('short.gpx', /nothing is left once they are hidden/));

  it('hides nothing when asked to trim 0, so the short track works', () => {
    assert.equal(run('short.gpx', '--trim', '0').status, 0);
  });

  it('does not create the output file when the input is unusable', () => {
    const { status } = run('page.gpx', '-o', 'never.gpx');
    assert.equal(status, 1);
    assert.throws(() => readFileSync(file('never.gpx')), { code: 'ENOENT' });
  });

  it('reports an output file that cannot be written', () => {
    const { status, stderr } = run('ride.gpx', '-o', 'no-such-folder/out.gpx');
    assert.equal(status, 1);
    assert.match(stderr, /cannot write no-such-folder\/out\.gpx/);
  });
});
