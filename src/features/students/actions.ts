'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/guards'
import { quickCreateStudentSchema } from './schema'

export type StudentActionResult =
  | { ok: true; studentId: string; studentNo: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

/**
 * Quick-create a learner.
 *
 * The admission number is generated in Postgres (app.next_student_no) and is
 * never accepted from the client, so two concurrent enrolments cannot be
 * handed the same number.
 *
 * Full enrolment is the six-step wizard in Phase 5, which writes through a
 * single transactional RPC. This is deliberately the minimal path.
 */
export async function quickCreateStudent(
  _prev: StudentActionResult | null,
  formData: FormData,
): Promise<StudentActionResult> {
  const session = await requirePermission('student.enrol')

  const parsed = quickCreateStudentSchema.safeParse({
    firstName: formData.get('firstName'),
    otherNames: formData.get('otherNames') ?? '',
    surname: formData.get('surname') ?? '',
    gender: formData.get('gender'),
    dateOfBirth: formData.get('dateOfBirth'),
    status: formData.get('status') ?? 'active',
    streamId: formData.get('streamId') ?? '',
    phone: formData.get('phone') ?? '',
    upi: formData.get('upi') ?? '',
    county: formData.get('county') ?? '',
    subCounty: formData.get('subCounty') ?? '',
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

  const { data: studentNo, error: noError } = await supabase.rpc('next_student_no', {
    p_tenant: session.tenantId,
  })

  if (noError || !studentNo) {
    return { ok: false, error: 'Could not allocate an admission number. Please try again.' }
  }

  const { data: stream } = data.streamId
    ? await supabase.from('streams').select('class_id').eq('id', data.streamId).single()
    : { data: null }

  const { data: created, error } = await supabase
    .from('students')
    .insert({
      tenant_id: session.tenantId,
      student_no: studentNo,
      first_name: data.firstName,
      other_names: data.otherNames || null,
      surname: data.surname || null,
      gender: data.gender,
      date_of_birth: data.dateOfBirth,
      status: data.status,
      phone: data.phone || null,
      upi: data.upi || null,
      county: data.county || null,
      sub_county: data.subCounty || null,
      current_stream_id: data.streamId || null,
      admitted_class_id: stream?.class_id ?? null,
      admitted_on: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single()

  if (error || !created) {
    // Duplicate UPI is the realistic failure here.
    return {
      ok: false,
      error:
        error?.code === '23505'
          ? 'That UPI or admission number already exists in this school.'
          : (error?.message ?? 'Could not save the learner.'),
    }
  }

  revalidatePath('/', 'layout')
  return { ok: true, studentId: created.id, studentNo }
}

/** Soft delete only. Hard deletes are refused by RLS (migration 0014). */
export async function softDeleteStudent(
  _prev: StudentActionResult | null,
  formData: FormData,
): Promise<StudentActionResult> {
  await requirePermission('student.edit')

  const studentId = String(formData.get('studentId') ?? '')
  if (!studentId) return { ok: false, error: 'Missing learner.' }

  const supabase = await createClient()

  const { error } = await supabase
    .from('students')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', studentId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true, studentId, studentNo: '' }
}