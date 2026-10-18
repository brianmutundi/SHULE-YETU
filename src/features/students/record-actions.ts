'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/guards'
import { bioSchema, consentSchema, logisticsSchema, medicalSchema } from './record-schema'

export type RecordActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

const fail = (error: unknown, fallback: string): RecordActionResult => ({
  ok: false,
  error: error instanceof Error ? error.message : fallback,
})

function formValues(formData: FormData, keys: readonly string[]) {
  return Object.fromEntries(
    keys.map((k) => [k, formData.get(k) ?? '']),
  ) as Record<string, FormDataEntryValue>
}

/**
 * Edit the learner's own details (section 7.7, Bio and Admission).
 *
 * The admission number is not editable: it is the school's identity for this
 * learner in KNEC reporting, and changing it would break the link to results
 * already recorded against it.
 */
export async function updateStudentBio(
  _prev: RecordActionResult | null,
  formData: FormData,
): Promise<RecordActionResult> {
  const session = await requirePermission('student.edit')

  const parsed = bioSchema.safeParse(
    formValues(formData, [
      'studentId', 'firstName', 'otherNames', 'surname', 'gender', 'dateOfBirth',
      'status', 'nationality', 'county', 'subCounty', 'upi', 'birthCertNo',
      'address', 'phone', 'email', 'orphanStatus', 'tuitionWaiver', 'streamId',
      'previousSchool', 'transferReason',
    ]),
  )

  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please correct the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const d = parsed.data
  const supabase = await createClient()

  const { error } = await supabase
    .from('students')
    .update({
      first_name: d.firstName,
      other_names: d.otherNames || null,
      surname: d.surname || null,
      gender: d.gender,
      date_of_birth: d.dateOfBirth,
      status: d.status,
      nationality: d.nationality || null,
      county: d.county,
      sub_county: d.subCounty,
      upi: d.upi || null,
      birth_cert_no: d.birthCertNo || null,
      address: d.address || null,
      phone: d.phone || null,
      email: d.email || null,
      orphan_status: d.orphanStatus,
      tuition_waiver: d.tuitionWaiver,
      // admitted_class_id is derived from this by trigger, not sent here.
      current_stream_id: d.streamId || null,
      previous_school: d.previousSchool || null,
      transfer_reason: d.transferReason || null,
    })
    .eq('id', d.studentId)
    .eq('tenant_id', session.tenantId)

  if (error) {
    return {
      ok: false,
      error:
        error.code === '23505'
          ? 'That UPI is already used by another learner in this school.'
          : error.message,
    }
  }

  revalidatePath(`/students/${d.studentId}`, 'page')
  return { ok: true }
}

/** Medical tab. Upserts, so a learner without a record gets one. */
export async function updateStudentMedical(
  _prev: RecordActionResult | null,
  formData: FormData,
): Promise<RecordActionResult> {
  const session = await requirePermission('student.edit')

  const parsed = medicalSchema.safeParse(
    formValues(formData, [
      'studentId', 'bloodGroup', 'allergies', 'conditions', 'emergencyContact',
      'strengths', 'challenges', 'specialNeedsCategory', 'specialNeedsNotes',
    ]),
  )

  if (!parsed.success) {
    return { ok: false, error: 'Please correct the highlighted fields.' }
  }

  const d = parsed.data
  const supabase = await createClient()

  const { error } = await supabase
    .from('student_medical')
    .upsert(
      {
        student_id: d.studentId,
        tenant_id: session.tenantId,
        blood_group: d.bloodGroup || null,
        allergies: d.allergies || null,
        conditions: d.conditions || null,
        emergency_contact: d.emergencyContact || null,
        strengths: d.strengths || null,
        challenges: d.challenges || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id' },
    )

  if (error) return fail(error, 'Could not save the medical record.')

  // Special needs live on the learner row so the directory can surface them.
  if (d.specialNeedsCategory || d.specialNeedsNotes) {
    const { error: snError } = await supabase
      .from('students')
      .update({
        special_needs_category: d.specialNeedsCategory || null,
        special_needs_notes: d.specialNeedsNotes || null,
      })
      .eq('id', d.studentId)
      .eq('tenant_id', session.tenantId)

    if (snError) return fail(snError, 'Could not save special needs details.')
  }

  revalidatePath(`/students/${d.studentId}`, 'page')
  return { ok: true }
}

/** Logistics tab. Boarding only applies where the school has a boarding wing. */
export async function updateStudentLogistics(
  _prev: RecordActionResult | null,
  formData: FormData,
): Promise<RecordActionResult> {
  const session = await requirePermission('student.edit')

  const parsed = logisticsSchema.safeParse(
    formValues(formData, ['studentId', 'transportMode', 'transportRoute', 'boardingStatus', 'house']),
  )

  if (!parsed.success) {
    return { ok: false, error: 'Please correct the highlighted fields.' }
  }

  const d = parsed.data
  const supabase = await createClient()

  const { error } = await supabase
    .from('student_logistics')
    .upsert(
      {
        student_id: d.studentId,
        tenant_id: session.tenantId,
        transport_mode: d.transportMode || null,
        transport_route: d.transportRoute || null,
        boarding_status: d.boardingStatus ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id' },
    )

  if (error) return fail(error, 'Could not save logistics.')

  // House lives on the learner so dormitory rosters need one query, not two.
  const { error: houseError } = await supabase
    .from('students')
    .update({ house: d.house || null })
    .eq('id', d.studentId)
    .eq('tenant_id', session.tenantId)

  if (houseError) return fail(houseError, 'Could not save the house.')

  revalidatePath(`/students/${d.studentId}`, 'page')
  return { ok: true }
}

/**
 * Record or withdraw a consent (section 4B).
 *
 * Every consent carries its lawful basis, and withdrawing is recorded as
 * granted = false rather than deleting the row, so the withdrawal itself stays
 * auditable.
 */
export async function updateStudentConsent(
  _prev: RecordActionResult | null,
  formData: FormData,
): Promise<RecordActionResult> {
  const session = await requirePermission('student.edit')

  const parsed = consentSchema.safeParse({
    studentId: formData.get('studentId'),
    consentKind: formData.get('consentKind'),
    granted: formData.get('granted') === 'true',
    lawfulBasis: formData.get('lawfulBasis') ?? 'consent',
  })

  if (!parsed.success) {
    return { ok: false, error: 'Please correct the highlighted fields.' }
  }

  const d = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.from('student_consents').upsert(
    {
      tenant_id: session.tenantId,
      student_id: d.studentId,
      consent_kind: d.consentKind,
      granted: d.granted,
      lawful_basis: d.lawfulBasis,
      granted_by: session.userId,
      granted_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,consent_kind' },
  )

  if (error) return fail(error, 'Could not save the consent.')

  revalidatePath(`/students/${d.studentId}`, 'page')
  return { ok: true }
}