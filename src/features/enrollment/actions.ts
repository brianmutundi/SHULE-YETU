'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/guards'
import { enrolmentSchema } from './schema'

export type EnrolmentResult = { ok: true; studentId: string } | { ok: false; error: string }

/**
 * Final enrolment submit.
 *
 * Everything is written by app.enrol_student() in a single transaction, so a
 * failure part way through leaves no half-enrolled learner. This action only
 * validates, calls the function, and surfaces its error message.
 */
export async function submitEnrolment(payload: unknown): Promise<EnrolmentResult> {
  await requirePermission('student.enrol')

  const parsed = enrolmentSchema.safeParse(payload)

  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const path = first.path.join('.')
    return {
      ok: false,
      error: `${path ? `${path}: ` : ''}${first.message}`,
    }
  }

  const data = parsed.data
  const supabase = await createClient()

  // The function takes a single jsonb document. Basic and senior enrolment
  // differ only in which branch is present, so the shape is assembled here
  // rather than inside SQL.
  const body: Record<string, unknown> = {
    student: {
      firstName: data.student.firstName,
      otherNames: data.student.otherNames,
      surname: data.student.surname,
      gender: data.student.gender,
      dateOfBirth: data.student.dateOfBirth,
      nationality: data.student.nationality,
      county: data.student.county,
      subCounty: data.student.subCounty,
      upi: data.student.upi,
      birthCertNo: data.student.birthCertNo,
      address: data.student.address,
      phone: data.student.phone,
      email: data.student.email,
      tuitionWaiver: data.student.tuitionWaiver,
      orphanStatus: data.student.orphanStatus,
    },
    health: data.health,
    logistics: data.logistics,
    guardians: data.guardians,
    consents: {
      enrolment: data.consents.enrolment,
      dataPrivacy: data.consents.dataPrivacy,
      media: data.consents.media,
      enrolmentBasis: data.consents.enrolmentBasis,
    },
  }

  if (data.operatingMode === 'basic') {
    body.admission = data.admission
  } else {
    // Map admission-shaped fields onto the placement keys the function reads.
    body.admission = {
      admittedOn: data.placement.admittedOn,
      previousSchool: data.placement.previousSchool,
      transferReason: data.placement.transferReason,
      streamId: data.placement.streamId,
      classId: '',
    }
    body.placement = {
      pathwayCode: data.placement.pathwayCode,
      track: data.placement.track,
      assessmentNumber: data.placement.assessmentNumber,
      subjectIds: data.placement.subjectIds,
    }
  }

  const { data: studentId, error } = await supabase.rpc('enrol_student', {
    p_payload: body as never,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  revalidatePath('/', 'layout')
  return { ok: true, studentId: studentId as string }
}

/** Enrolment is complete; send the registrar to the new learner's record. */
export async function finishEnrolment(studentId: string): Promise<never> {
  redirect(`/students?id=${studentId}`)
}