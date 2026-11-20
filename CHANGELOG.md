# Changelog

## 0.1.0

Initial release.

- Parses GPX tracks and routes with entity processing off and a 10 MiB size limit.
- Hides the start and the end of a track within a chosen radius, wherever they recur along it.
- Simplifies tracks to a point budget while keeping their shape and segments.
- Computes distance, climb and descent with a GPS-noise hysteresis, and duration when times exist.
- Writes a minimal GPX 1.1 file with positions, heights and times only.
- Ships a `gpx-privacy` command with `--trim`, `--max-points`, `--stats` and `--json`.
