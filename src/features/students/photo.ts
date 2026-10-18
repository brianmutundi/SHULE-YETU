/** Pure helpers for learner photos. The bucket is created in migration 20261018010000. */
export const STUDENT_PHOTO_BUCKET = 'student-photos'
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** Returns an error message, or null when the file is acceptable. */
export function validatePhoto(file: { type: string; size: number }): string | null {
  if (!(file.type in EXTENSIONS)) return 'Photo must be a JPEG, PNG or WebP image.'
  if (file.size <= 0) return 'The photo file is empty.'
  if (file.size > MAX_PHOTO_BYTES) return 'Photo must be 2 MB or smaller.'
  return null
}

export function photoExtension(mimeType: string): string | null {
  return EXTENSIONS[mimeType] ?? null
}

/**
 * Object path: <tenant_id>/<student_id>-<uuid>.<ext>
 * The tenant id MUST be the first folder: the storage policies compare it to
 * the caller's tenant.
 */
export function buildPhotoPath(
  tenantId: string,
  studentId: string,
  unique: string,
  extension: string,
): string {
  return `${tenantId}/${studentId}-${unique}.${extension}`
}
