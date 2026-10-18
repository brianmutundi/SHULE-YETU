import 'server-only'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getOperatingMode,
  getSchoolTypeDefinition,
  isSchoolType,
  type OperatingMode,
  type SchoolType,
} from '@/lib/school-type'
import type { Database } from '@/lib/supabase/types'

export interface SessionContext {
  userId: string
  email: string | null
  fullName: string | null
  role: Database['public']['Enums']['app_role']
  tenantId: string
  tenantName: string
  schoolType: SchoolType
  operatingMode: OperatingMode
  /** Resolved once here so callers never touch school_type directly. */
  schoolTypeDefinition: ReturnType<typeof getSchoolTypeDefinition>
}

/**
 * Load the caller's profile and tenant.
 *
 * This is where the school type is resolved. Components receive the derived
 * operating mode and feature flags rather than the raw enum, so no UI code
 * ever compares `school_type` (CLAUDE.md section 4A).
 */
export async function getSessionContext(): Promise<SessionContext> {
  // Under Cache Components this opts the whole route out of prerendering. It
  // must come first: constructing the Supabase client reads Date.now()
  // internally, and an unstable value reached during prerender fails the
  // build. `instant = false` is not honoured on layouts.
  await connection()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, tenant_id, full_name, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.tenant_id) {
    // Signed in but not yet attached to a school: send them to finish setting
    // one up. Redirecting to /login here would loop, because the proxy bounces
    // an authenticated visitor away from /login straight back to /home.
    redirect('/register')
  }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, name, school_type')
    .eq('id', profile.tenant_id)
    .single()

  if (tenantError || !tenant || !isSchoolType(tenant.school_type)) {
    // RLS already hides other tenants, so reaching here means the data is
    // inconsistent. Fail closed rather than guessing a school type.
    throw new Error('Could not resolve the school for this account.')
  }

  const schoolType = tenant.school_type

  return {
    userId: user.id,
    email: user.email ?? null,
    fullName: profile.full_name,
    role: profile.role,
    tenantId: tenant.id,
    tenantName: tenant.name,
    schoolType,
    operatingMode: getOperatingMode(schoolType),
    schoolTypeDefinition: getSchoolTypeDefinition(schoolType),
  }
}