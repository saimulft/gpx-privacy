#!/usr/bin/env node
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULTS, GpxError, makeShareable } from './index.ts';
import type { ShareableResult, Stats } from './index.ts';

const HELP = `gpx-privacy: make a GPX track safe to share.

Usage:
  gpx-privacy <in.gpx> [-o out.gpx] [--trim 500] [--max-points N] [--drop-times] [--stats] [--json]

Hides the start and the end of the track, simplifies it, and writes a minimal GPX file
to stdout, or to the file given with -o.

Options:
  -o, --output <file>   write the GPX to this file instead of stdout
      --trim <metres>   hide this far around the start and the end (default ${DEFAULTS.trimMeters}; 0 hides nothing)
      --max-points <n>  keep at most this many points (default ${DEFAULTS.maxPoints})
      --drop-times      leave the timestamps out of the GPX
      --stats           print distance, climb, descent and duration to stderr
      --json            print the stats as JSON to stderr (implies --stats)
  -v, --version         print the version
  -h, --help            print this help

Stats are printed to stderr whenever -o, --stats or --json is given, so stdout only ever carries the GPX.
The stats describe the whole recorded track, ends included.

Exit codes: 0 done, 1 the input could not be read or used, 2 wrong usage.
`;

class UsageError extends Error {}

const number = (
  flag: string,
  value: string | undefined,
  fallback: number,
  check: (n: number) => boolean,
  rule: string,
) => {
  if (value === undefined) return fallback;
  const n = value.trim() === '' ? Number.NaN : Number(value);
  if (!Number.isFinite(n) || !check(n)) throw new UsageError(`${flag} must be ${rule}, got "${value}"`);
  return n;
};

const group = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function clock(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function summary(input: string, output: string | undefined, trim: number, result: ShareableResult): string {
  const { stats, points } = result;
  const rows: [string, string][] = [
    ['Trimmed', trim > 0 ? `${group(trim)} m from the start and the end` : 'nothing'],
    ['Points', `${group(points.input)} -> ${group(points.output)}`],
    ['Distance', `${group(stats.distance / 1000, 2)} km`],
    ['Climb', stats.climb === null ? 'n/a (no elevation)' : `${group(stats.climb)} m`],
    ['Descent', stats.descent === null ? 'n/a (no elevation)' : `${group(stats.descent)} m`],
    ['Duration', stats.duration === null ? 'n/a (no times)' : clock(stats.duration)],
  ];
  const head = `gpx-privacy: ${input} -> ${output ?? 'stdout'}`;
  return [head, ...rows.map(([label, value]) => `  ${label.padEnd(10)}${value}`), ''].join('\n');
}

const round = (value: number | null, places: number) => (value === null ? null : Number(value.toFixed(places)));
const roundStats = (s: Stats) => ({
  points: s.points,
  distance: round(s.distance, 1),
  climb: round(s.climb, 1),
  descent: round(s.descent, 1),
  duration: round(s.duration, 0),
});

function sameFile(a: string, b: string): boolean {
  const real = (path: string) => {
    try {
      return realpathSync(path);
    } catch {
      return resolve(path);
    }
  };
  return real(a) === real(b);
}

function main(argv: string[]): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        output: { type: 'string', short: 'o' },
        trim: { type: 'string' },
        'max-points': { type: 'string' },
        'drop-times': { type: 'boolean' },
        stats: { type: 'boolean' },
        json: { type: 'boolean' },
        version: { type: 'boolean', short: 'v' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    return usage(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (values.version) {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }

  let trim: number;
  let maxPoints: number;
  try {
    if (positionals.length !== 1)
      throw new UsageError(positionals.length === 0 ? 'missing input file' : 'only one input file is accepted');
    trim = number('--trim', values.trim, DEFAULTS.trimMeters, (n) => n >= 0, 'a number of metres, 0 or more');
    maxPoints = number(
      '--max-points',
      values['max-points'],
      DEFAULTS.maxPoints,
      (n) => Number.isInteger(n) && n >= 2,
      'a whole number of at least 2',
    );
    if (values.output !== undefined && sameFile(values.output, positionals[0])) {
      throw new UsageError('the output file is the input file; the original would be overwritten');
    }
  } catch (error) {
    if (error instanceof UsageError) return usage(error.message);
    throw error;
  }

  const input = positionals[0];
  let result: ShareableResult;
  try {
    result = makeShareable(readFileSync(input, 'utf8'), { trim, maxPoints, dropTimes: values['drop-times'] === true });
  } catch (error) {
    const reason = error instanceof GpxError ? error.message : error instanceof Error ? error.message : String(error);
    process.stderr.write(`gpx-privacy: cannot use ${input}: ${reason}\n`);
    return 1;
  }

  if (values.output === undefined) {
    process.stdout.write(result.gpx);
  } else {
    try {
      writeFileSync(values.output, result.gpx);
    } catch (error) {
      process.stderr.write(
        `gpx-privacy: cannot write ${values.output}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      return 1;
    }
  }

  if (values.json) {
    const report = {
      input,
      output: values.output ?? null,
      name: result.name ?? null,
      trim,
      maxPoints,
      dropTimes: values['drop-times'] === true,
      points: result.points,
      stats: roundStats(result.stats),
      shared: roundStats(result.shared),
    };
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (values.stats || values.output !== undefined) {
    process.stderr.write(summary(input, values.output, trim, result));
  }
  return 0;
}

function usage(message: string): number {
  process.stderr.write(`gpx-privacy: ${message}\nTry "gpx-privacy --help".\n`);
  return 2;
}

process.exitCode = main(process.argv.slice(2));
