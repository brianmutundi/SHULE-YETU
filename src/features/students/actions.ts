'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/guards'
import { todayInNairobi } from '@/lib/dates'
import { quickCreateStudentSchema } from './schema'
import { fullNameOf } from './name'
import {
  buildPhotoPath,
  photoExtension,
  STUDENT_PHOTO_BUCKET,
  validatePhoto,
} from './photo'

export type StudentActionResult =
  | {
      ok: true
      studentId: string
      studentNo: string
      /** Null-safe join of the three name parts. */
      fullName?: string
      /** Set when the learner was saved but the photo was not. */
      photoWarning?: string
    }
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
    nationality: formData.get('nationality') ?? '',
    religion: formData.get('religion') ?? '',
    address: formData.get('address') ?? '',
    tuitionWaiver: formData.get('tuitionWaiver') === 'on',
    admittedOn: formData.get('admittedOn') ?? '',
    sessionId: formData.get('sessionId') ?? '',
    mediaConsent: formData.get('mediaConsent') === 'on',
  })

  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please correct the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const data = parsed.data

  // Validate the photo and its consent before anything is written, so a bad
  // file never leaves a half-registered learner behind.
  const photoEntry = formData.get('photo')
  const photo = photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null
  if (photo) {
    const photoError = validatePhoto(photo)
    if (photoError) return { ok: false, error: photoError }
    if (!data.mediaConsent) {
      return {
        ok: false,
        error: 'Confirm the guardian has consented to a photograph before adding one.',
      }
    }
  }

  const supabase = await createClient()

  const { data: studentNo, error: noError } = await supabase.rpc('next_student_no', {
    p_tenant: session.tenantId,
  })

  if (noError || !studentNo) {
    return { ok: false, error: 'Could not allocate an admission number. Please try again.' }
  }

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
      nationality: data.nationality || null,
      religion: data.religion || null,
      address: data.address || null,
      tuition_waiver: data.tuitionWaiver,
      // admitted_class_id is derived from the stream by a database trigger and
      // is deliberately not sent (CLAUDE.md section 9).
      current_stream_id: data.streamId || null,
      admitted_on: data.admittedOn || todayInNairobi(),
      admitted_session_id: data.sessionId || null,
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

  let photoWarning: string | undefined
  if (photo) {
    photoWarning = await attachPhoto({
      supabase,
      tenantId: session.tenantId,
      userId: session.userId,
      studentId: created.id,
      photo,
    })
  }

  revalidatePath('/', 'layout')
  return {
    ok: true,
    studentId: created.id,
    studentNo,
    fullName: fullNameOf(data.firstName, data.otherNames, data.surname),
    photoWarning,
  }
}

/**
 * Upload the photo, record the media consent, then point the learner at it.
 *
 * Returns a warning instead of failing: the learner row already exists and
 * the photo can be added later. If the consent row cannot be written the
 * uploaded file is removed, so a photo never exists without a consent record.
 */
async function attachPhoto({
  supabase,
  tenantId,
  userId,
  studentId,
  photo,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  tenantId: string
  userId: string
  studentId: string
  photo: File
}): Promise<string | undefined> {
  const extension = photoExtension(photo.type)
  if (!extension) return 'The learner was saved, but the photo type is not supported.'

  const path = buildPhotoPath(tenantId, studentId, crypto.randomUUID(), extension)

  const { error: uploadError } = await supabase.storage
    .from(STUDENT_PHOTO_BUCKET)
    .upload(path, photo, { contentType: photo.type, upsert: false })
  if (uploadError) return 'The learner was saved, but the photo could not be uploaded.'

  const { error: consentError } = await supabase.from('student_consents').upsert(
    {
      tenant_id: tenantId,
      student_id: studentId,
      consent_kind: 'media',
      granted: true,
      lawful_basis: 'consent',
      granted_by: userId,
    },
    { onConflict: 'student_id,consent_kind' },
  )
  if (consentError) {
    await supabase.storage.from(STUDENT_PHOTO_BUCKET).remove([path])
    return 'The learner was saved, but the photo consent could not be recorded, so the photo was not kept.'
  }

  const { error: updateError } = await supabase
    .from('students')
    .update({ photo_url: path })
    .eq('id', studentId)
  if (updateError) return 'The learner was saved, but the photo could not be attached.'

  return undefined
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