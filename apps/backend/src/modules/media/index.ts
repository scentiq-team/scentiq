// The media library (ADR-0009): decide what an uploaded file is, turn it into safe WebP variants, and
// store them. A library only: the upload endpoint arrives with Studio (Phase 7).

export {
  ALLOWED_TYPES,
  type AllowedType,
  type DetectedType,
  detectImageType,
  isAllowedType,
} from './detect.js';
export { isMediaError, MediaError, type MediaErrorReason } from './errors.js';
export {
  MAX_SOURCE_PIXELS,
  MAX_UPLOAD_BYTES,
  type ProcessedImage,
  type ProcessedVariant,
  type ProcessOptions,
  processImage,
  sanitizeLabel,
} from './process.js';
export {
  deleteMediaAsset,
  type MediaLabels,
  processAndStoreImage,
  type StoredMedia,
  storeProcessedImage,
  type UploadInput,
  variantKey,
} from './register.js';
export {
  assertValidStorageKey,
  InvalidStorageKeyError,
  LocalDiskStorage,
  type MediaStorage,
  newStorageKey,
} from './storage.js';
