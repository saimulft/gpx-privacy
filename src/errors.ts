/** Why a GPX file was refused. */
export type GpxErrorCode =
  /** The text is not a GPX document. */
  | 'invalid_gpx'
  /** The document is larger than the `maxBytes` limit. */
  | 'too_large'
  /** The file holds fewer than two track points. */
  | 'empty_route'
  /** Nothing is left once the start and end are hidden. */
  | 'route_too_short';

/** The error every refused file throws. Check `code` to tell the cases apart. */
export class GpxError extends Error {
  readonly code: GpxErrorCode;

  constructor(code: GpxErrorCode, message: string) {
    super(message);
    this.name = 'GpxError';
    this.code = code;
  }
}
