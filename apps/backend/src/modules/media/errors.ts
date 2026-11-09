// What the media library can refuse, as stable machine keys the HTTP layer (Phase 7) maps to Arabic
// messages. `reason` never contains the file's content or name; `details` holds only numbers and the
// detected type, so an error can be logged and returned safely.

export type MediaErrorReason =
  /** Bigger than the upload limit, or empty. */
  | 'too_large'
  | 'empty'
  /** The bytes are not an image we accept (SVG, PDF, HTML, GIF, AVIF, unknown). `details.detected` says what. */
  | 'unsupported_type'
  /** An iPhone HEIC photo: recognised, but this server cannot decode it. Ask for JPEG. */
  | 'heic_not_supported'
  /** The signature says one thing and the content says another, or the file cannot be decoded. */
  | 'corrupt'
  /** More pixels than the limit: a decompression bomb, or simply too big a photo. */
  | 'too_many_pixels'
  /** Narrower than the smallest variant: we never enlarge. */
  | 'too_small'
  /** An animated image (APNG, animated WebP). Product photos are still images. */
  | 'animated_not_supported'
  /** Another file format hides after the end of the image (a polyglot). */
  | 'polyglot_suspected';

export class MediaError extends Error {
  readonly reason: MediaErrorReason;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    reason: MediaErrorReason,
    details: Record<string, unknown> = {},
    options?: { cause?: unknown },
  ) {
    super(`media: ${reason}`, options);
    this.name = 'MediaError';
    this.reason = reason;
    this.details = details;
  }
}

export const isMediaError = (error: unknown): error is MediaError => error instanceof MediaError;
