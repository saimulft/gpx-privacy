/** True when the input is a list of segments rather than one list of points. */
export function isSegments<T>(input: T[] | T[][]): input is T[][] {
  return input.length > 0 && Array.isArray(input[0]);
}

/** One list of points or a list of segments, always as a list of segments. */
export function toSegments<T>(input: T[] | T[][]): T[][] {
  if (isSegments(input)) return input;
  return input.length > 0 ? [input] : [];
}
