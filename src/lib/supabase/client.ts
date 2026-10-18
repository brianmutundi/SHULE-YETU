import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

/**
 * Browser Supabase client. Publishable key only — never the secret key.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * because Next.js only inlines NEXT_PUBLIC_-prefixed variables into the client
 * bundle.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}