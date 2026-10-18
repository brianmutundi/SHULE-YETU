'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { registrationSchema, signInSchema } from './schema'
import type { SchoolType } from '@/lib/school-type'

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

/**
 * Register a school and its first owner.
 *
 * Order matters and is not interchangeable:
 *   1. create the auth user
 *   2. create the tenant (allowed by tenants_insert_own, which requires the
 *      caller's profile to have no tenant yet)
 *   3. claim_tenant() binds the profile and seeds the per-school-type
 *      levels/classes in one transaction
 *
 * Step 3 is what enforces that school type and class structure can never
 * disagree; the client cannot choose classes directly.
 */
export async function registerSchool(
  _prev: ActionResult<{ tenantId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ tenantId: string }>> {
  const parsed = registrationSchema.safeParse({
    schoolName: formData.get('schoolName'),
    ownership: formData.get('ownership'),
    boardingMode: formData.get('boardingMode'),
    gender: formData.get('gender'),
    county: formData.get('county'),
    subCounty: formData.get('subCounty'),
    schoolCode: formData.get('schoolCode') ?? '',
    knecCenterCode: formData.get('knecCenterCode') ?? '',
    sponsor: formData.get('sponsor') ?? '',
    adminName: formData.get('adminName'),
    adminEmail: formData.get('adminEmail'),
    adminPhone: formData.get('adminPhone'),
    password: formData.get('password'),
    schoolType: formData.get('schoolType'),
    capitationEnabled: formData.get('capitationEnabled') === 'on',
  })

  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please correct the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const data = parsed.data
  const supabase = await createClient()

  // 1. Auth user. Metadata is display-only; authorization data never comes
  //    from here because raw_user_meta_data is user-editable.
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.adminEmail,
    password: data.password,
    options: {
      data: { full_name: data.adminName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/home`,
    },
  })

  if (authError) {
    return { ok: false, error: authError.message }
  }

  if (!authData.user) {
    return { ok: false, error: 'Could not create the account. Please try again.' }
  }
  // 2. Tenant row.
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({
      name: data.schoolName,
      school_type: data.schoolType as SchoolType,
      ownership: data.ownership,
      boarding_mode: data.boardingMode,
      gender: data.gender,
      sponsor: data.sponsor || null,
      county: data.county,
      sub_county: data.subCounty,
      school_code: data.schoolCode || null,
      knec_center_code: data.knecCenterCode || null,
      capitation_enabled: data.capitationEnabled,
    })
    .select('id')
    .single()

  if (tenantError || !tenant) {
    return {
      ok: false,
      error: 'The account was created but the school could not be set up. Please contact support.',
    }
  }

  // 3. Claim the tenant. This assigns the owner role and seeds levels/classes.
  const { error: claimError } = await supabase.rpc('claim_tenant', { p_tenant: tenant.id })

  if (claimError) {
    return { ok: false, error: claimError.message }
  }

  redirect('/home')
}

export async function signIn(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please correct the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return { ok: false, error: 'Those credentials did not match an account.' }
  }

  redirect('/home')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}