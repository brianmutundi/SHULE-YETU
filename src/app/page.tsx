import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Reads cookies() to resolve the session, so this route cannot be prerendered.
// Cache Components requires an explicit opt-out rather than an implicit one.
export const instant = false

export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  redirect(user ? '/home' : '/login')
}