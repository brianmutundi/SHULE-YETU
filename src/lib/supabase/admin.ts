import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Server-only. Every call site must state why RLS could not satisfy the
 * requirement. Never import this from a Client Component or expose it through
 * a user-reachable request path (CLAUDE.md section 4).
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!url || !secretKey) {
    throw new Error('Supabase server configuration is missing.')
  }

  return createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}