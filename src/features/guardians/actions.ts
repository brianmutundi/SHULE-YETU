'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/guards'
import { resolveStudentNo } from './queries'
import { createGuardianSchema, linkStudentSchema, unlinkStudentSchema, addStudentGuardianSchema } from './schema'

/**
 * Resolve an admission number to a learner name, for the Link Student dialog.
 *
 * A server function cannot be handed to a Client Component as a prop, so this
 * is exposed as an action the dialog imports directly. Read-only and narrow:
 * it returns only what is needed to confirm a match.
 */
export async function resolveLearner(studentNo: string): Promise<{ fullName: string } | null> {
  return resolveStudentNo(studentNo)
}

export type GuardianActionResult =
  | { ok: true; guardianId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

export async function createGuardian(
  _prev: GuardianActionResult | null,
  formData: FormData,
): Promise<GuardianActionResult> {
  const session = await requirePermission('guardian.manage')

  const parsed = createGuardianSchema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    email: formData.get('email') ?? '',
    nationalId: formData.get('nationalId') ?? '',
    occupation: formData.get('occupation') ?? '',
    relationship: formData.get('relationship') ?? 'parent',
    isDeceased: formData.get('isDeceased') === 'on',
    absenceReason: formData.get('absenceReason') ?? '',
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

  const { data: guardian, error } = await supabase
    .from('guardians')
    .insert({
      tenant_id: session.tenantId,
      full_name: data.fullName,
      phone: data.phone,
      email: data.email || null,
      national_id: data.nationalId || null,
      occupation: data.occupation || null,
      is_deceased: data.isDeceased,
      absence_reason: data.isDeceased ? data.absenceReason || null : null,
    })
    .select('id')
    .single()

  if (error || !guardian) {
    return { ok: false, error: error?.message ?? 'Could not save the guardian.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, guardianId: guardian.id }
}

/**
 * Link a learner to a guardian.
 *
 * The admission number is resolved server-side. Duplicate links, a second
 * primary guardian and a second fee payer are all refused by database
 * constraints rather than by an application check, so they hold under
 * concurrent writes.
 */
export async function linkStudent(
  _prev: GuardianActionResult | null,
  formData: FormData,
): Promise<GuardianActionResult> {
  await requirePermission('guardian.manage')

  const parsed = linkStudentSchema.safeParse({
    guardianId: formData.get('guardianId'),
    studentNo: formData.get('studentNo'),
    relationship: formData.get('relationship') ?? 'parent',
    isPrimary: formData.get('isPrimary') === 'on',
    isEmergencyContact: formData.get('isEmergencyContact') === 'on',
    isFeePayer: formData.get('isFeePayer') === 'on',
  })

  if (!parsed.success) {
    return { ok: false, error: 'Enter a valid admission number.' }
  }

  const data = parsed.data
  const supabase = await createClient()

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id')
    .eq('student_no', data.studentNo)
    .is('deleted_at', null)
    .maybeSingle()

  if (studentError) return { ok: false, error: studentError.message }

  if (!student) {
    return { ok: false, error: `No learner found with admission number ${data.studentNo}.` }
  }

  const { error } = await supabase.from('student_guardians').insert({
    student_id: student.id,
    guardian_id: data.guardianId,
    relationship: data.relationship,
    is_primary: data.isPrimary,
    is_emergency_contact: data.isEmergencyContact,
    is_fee_payer: data.isFeePayer,
  })

  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        error:
          'That link already exists, or this learner already has a primary guardian or fee payer.',
      }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/', 'layout')
  return { ok: true, guardianId: data.guardianId }
}

export async function unlinkStudent(
  _prev: GuardianActionResult | null,
  formData: FormData,
): Promise<GuardianActionResult> {
  await requirePermission('guardian.manage')

  const parsed = unlinkStudentSchema.safeParse({
    guardianId: formData.get('guardianId'),
    studentId: formData.get('studentId'),
  })

  if (!parsed.success) return { ok: false, error: 'Missing link.' }

  const supabase = await createClient()

  const { error } = await supabase
    .from('student_guardians')
    .delete()
    .eq('guardian_id', parsed.data.guardianId)
    .eq('student_id', parsed.data.studentId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true, guardianId: parsed.data.guardianId }
}

/**
 * Add a guardian to a learner from the Full Student Record (section 7.7).
 *
 * Creates the guardian and the link together through app.add_student_guardian,
 * so a failure cannot leave a guardian row that no learner references.
 */
export async function addStudentGuardian(
  _prev: GuardianActionResult | null,
  formData: FormData,
): Promise<GuardianActionResult> {
  await requirePermission('guardian.manage')

  const parsed = addStudentGuardianSchema.safeParse({
    studentId: formData.get('studentId'),
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    email: formData.get('email') ?? '',
    nationalId: formData.get('nationalId') ?? '',
    occupation: formData.get('occupation') ?? '',
    address: formData.get('address') ?? '',
    relationship: formData.get('relationship') ?? 'parent',
    isPrimary: formData.get('isPrimary') === 'true',
    isEmergencyContact: formData.get('isEmergencyContact') === 'true',
    isFeePayer: formData.get('isFeePayer') === 'true',
    isDeceased: formData.get('isDeceased') === 'true',
    absenceReason: formData.get('absenceReason') ?? '',
  })

  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first.path.length ? `${first.path.join('.')}: ${first.message}` : first.message,
    }
  }

  const d = parsed.data
  const supabase = await createClient()

  const { data: guardianId, error } = await supabase.rpc('add_student_guardian', {
    p_student: d.studentId,
    p_guardian: {
      fullName: d.fullName,
      phone: d.phone,
      email: d.email,
      nationalId: d.nationalId,
      occupation: d.occupation,
      address: d.address,
      relationship: d.relationship,
      isPrimary: d.isPrimary,
      isEmergencyContact: d.isEmergencyContact,
      isFeePayer: d.isFeePayer,
      isDeceased: d.isDeceased,
      absenceReason: d.absenceReason,
    } as never,
  })

  if (error) {
    return {
      ok: false,
      error:
        error.code === '23505'
          ? 'This learner already has a primary guardian or a fee payer. Unlink the existing one first.'
          : error.message,
    }
  }

  revalidatePath(`/students/${d.studentId}`, 'page')
  return { ok: true, guardianId: guardianId as string }
}