'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/guards'

export type ClassActionResult = { ok: true } | { ok: false; error: string }

export async function createStream(
  _prev: ClassActionResult | null,
  formData: FormData,
): Promise<ClassActionResult> {
  const session = await requirePermission('session.manage')

  const classId = String(formData.get('classId') ?? '')
  const academicYearId = String(formData.get('academicYearId') ?? '')
  const label = String(formData.get('label') ?? '').trim()

  if (!classId || !academicYearId) {
    return { ok: false, error: 'Select a class and an academic year.' }
  }
  if (label.length < 1 || label.length > 40) {
    return { ok: false, error: 'Enter a stream name between 1 and 40 characters.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.from('streams').insert({
    tenant_id: session.tenantId,
    class_id: classId,
    academic_year_id: academicYearId,
    stream_label: label,
    full_name: '', // derived by trigger
  })

  if (error) {
    // The unique index reports a duplicate as a constraint violation.
    return {
      ok: false,
      error: error.code === '23505'
        ? 'That stream already exists for this class in this year.'
        : error.message,
    }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function renameStream(
  _prev: ClassActionResult | null,
  formData: FormData,
): Promise<ClassActionResult> {
  await requirePermission('session.manage')

  const streamId = String(formData.get('streamId') ?? '')
  const label = String(formData.get('label') ?? '').trim()

  if (!streamId || label.length < 1 || label.length > 40) {
    return { ok: false, error: 'Enter a stream name between 1 and 40 characters.' }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('streams')
    .update({ stream_label: label })
    .eq('id', streamId)

  if (error) {
    return {
      ok: false,
      error: error.code === '23505'
        ? 'That stream already exists for this class in this year.'
        : error.message,
    }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function deleteStream(
  _prev: ClassActionResult | null,
  formData: FormData,
): Promise<ClassActionResult> {
  await requirePermission('session.manage')

  const streamId = String(formData.get('streamId') ?? '')

  if (!streamId) {
    return { ok: false, error: 'Missing stream.' }
  }

  const supabase = await createClient()

  // The database refuses to delete a stream that still has learners
  // (streams_students_present guard), so an occupied stream surfaces the
  // database's message rather than a silent no-op.
  const { error } = await supabase.from('streams').delete().eq('id', streamId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function cloneStreams(
  _prev: ClassActionResult & { copied?: number } | null,
  formData: FormData,
): Promise<ClassActionResult & { copied?: number }> {
  await requirePermission('session.manage')

  const fromYear = String(formData.get('fromYear') ?? '')
  const toYear = String(formData.get('toYear') ?? '')
  const replace = formData.get('replace') === 'on'

  if (!fromYear || !toYear) {
    return { ok: false, error: 'Choose a source and a target academic year.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('clone_streams', {
    p_from_year: fromYear,
    p_to_year: toYear,
    p_replace: replace,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true, copied: typeof data === 'number' ? data : 0 }
}

/** Seed the default A/B streams for a class in a given year. */
export async function seedDefaultStreams(
  _prev: ClassActionResult & { created?: number } | null,
  formData: FormData,
): Promise<ClassActionResult & { created?: number }> {
  const session = await requirePermission('session.manage')

  const academicYearId = String(formData.get('academicYearId') ?? '')
  if (!academicYearId) return { ok: false, error: 'Missing academic year.' }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('ensure_streams', {
    p_tenant: session.tenantId,
    p_year: academicYearId,
    p_labels: ['A', 'B'],
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true, created: typeof data === 'number' ? data : 0 }
}