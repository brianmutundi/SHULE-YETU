import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { connection } from 'next/server'
import type { Database } from './types'

/**
 * Server-side Supabase client for Server Components, Server Actions and Route
 * Handlers. Session is read from and written to cookies.
 *
 * `cookies()` is async-only in Next.js 16; synchronous access was removed.
 */
export async function createClient() {
  // Under Cache Components, constructing the Supabase client reads Date.now().
  // Opt out of prerendering first, or any page that builds a client before
  // another dynamic access fails with "unstable value Date.now()".
  await connection()

  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The proxy refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  )
}