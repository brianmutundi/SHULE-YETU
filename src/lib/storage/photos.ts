import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { STUDENT_PHOTO_BUCKET } from '@/features/students/photo'

const SIGNED_URL_SECONDS = 60 * 60

/**
 * Turn stored photo paths into short-lived signed URLs, in one request.
 *
 * Returns a map keyed by the stored value. Anything that is already an
 * absolute URL passes through, and a path that cannot be signed is simply
 * missing from the map so the UI falls back to initials.
 */
export async function signPhotoUrls(
  supabase: SupabaseClient,
  stored: (string | null)[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const paths: string[] = []

  for (const value of new Set(stored.filter((v): v is string => Boolean(v)))) {
    if (/^https?:\/\//i.test(value)) result.set(value, value)
    else paths.push(value)
  }

  if (paths.length === 0) return result

  const { data } = await supabase.storage
    .from(STUDENT_PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS)

  for (const item of data ?? []) {
    if (item.path && item.signedUrl) result.set(item.path, item.signedUrl)
  }
  return result
}
