import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/supabase/types'

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`. This file runs on the
 * Node.js runtime (the edge runtime is not supported in proxy).
 *
 * Two jobs, and only two:
 *   1. Refresh the auth session so Server Components see a valid user.
 *   2. Send unauthenticated users to /login before a protected page renders.
 *
 * This is NOT an authorization layer. The proxy matcher can be narrowed by a
 * refactor that silently drops coverage, so every Server Action and Route
 * Handler must still authorize independently (CLAUDE.md section 4).
 */

const PUBLIC_PATHS = ['/login', '/register']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // Do not skip this: it is what keeps the session cookie fresh.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.search = ''
    // Preserve the intended destination so login can send the user onward.
    if (pathname !== '/') redirectUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // /register serves two audiences: signed-out visitors creating their first
  // account, and signed-in users who have not yet claimed a tenant. Only
  // bounce away /login, which a signed-in user has no reason to revisit.
  if (user && pathname.startsWith('/login')) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/home'
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimization, so auth logic
     * can never block CSS, JS or images from loading.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}