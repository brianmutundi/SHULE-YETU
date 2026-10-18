import 'server-only'
import { connection } from 'next/server'
import { getSessionContext } from '@/lib/auth/session'
import { getAcademicPeriod } from '@/lib/auth/period'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

export type StudentStatus = Database['public']['Enums']['student_status']

export interface RecordGuardian {
  linkId: string
  guardianId: string
  fullName: string
  nationalId: string | null
  phone: string
  email: string | null
  occupation: string | null
  address: string | null
  isDeceased: boolean
  absenceReason: string | null
  relationship: string
  isPrimary: boolean
  isEmergencyContact: boolean
  isFeePayer: boolean
}

export interface RecordConsent {
  consentKind: 'guardian_enrollment' | 'data_privacy' | 'media'
  granted: boolean
  lawfulBasis: string
  grantedAt: string
  grantedByName: string | null
}

export interface RecordSubject {
  id: string
  code: string
  name: string
  isCore: boolean
  requirement: string | null
  selectionCutoffAt: string | null
}

export interface StudentRecord {
  id: string
  studentNo: string
  firstName: string
  otherNames: string | null
  surname: string | null
  fullName: string
  gender: 'male' | 'female'
  dateOfBirth: string
  status: StudentStatus
  nationality: string | null
  county: string | null
  subCounty: string | null
  upi: string | null
  birthCertNo: string | null
  address: string | null
  phone: string | null
  email: string | null
  photoUrl: string | null
  admittedOn: string | null
  streamId: string | null
  streamLabel: string | null
  classLabel: string | null
  pathwayCode: string | null
  pathwayName: string | null
  track: string | null
  assessmentNumber: string | null
  previousSchool: string | null
  transferReason: string | null
  orphanStatus: string
  tuitionWaiver: boolean
  house: string | null

  guardians: RecordGuardian[]
  medical: {
    bloodGroup: string | null
    allergies: string | null
    conditions: string | null
    emergencyContact: string | null
    strengths: string | null
    challenges: string | null
  } | null
  logistics: {
    transportMode: string | null
    transportRoute: string | null
    boardingStatus: string | null
  } | null
  consents: RecordConsent[]
  documents: { id: string; kind: string; storagePath: string; createdAt: string }[]
  subjects: RecordSubject[]
  streams: { id: string; label: string; classLabel: string }[]
}

const EMPTY: StudentRecord['medical'] = null

/**
 * Everything the Full Student Record shows, fetched in parallel.
 *
 * Read through the caller's RLS, so a learner outside the tenant is simply not
 * found rather than leaked.
 */
export async function getStudentRecord(
  studentId: string,
): Promise<StudentRecord | null> {
  await connection()

  const session = await getSessionContext()
  const { period } = await getAcademicPeriod()
  const supabase = await createClient()

  const { data: student } = await supabase
    .from('students')
    .select(
      `id, student_no, first_name, other_names, surname, gender, date_of_birth,
       status, nationality, county, sub_county, upi, birth_cert_no, address,
       phone, email, photo_url, admitted_on, current_stream_id, pathway_id,
       track, assessment_number, previous_school, transfer_reason,
       orphan_status, tuition_waiver, house`,
    )
    .eq('id', studentId)
    .eq('tenant_id', session.tenantId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!student) return null

  const [links, medical, logistics, consents, documents, subjects, streams, pathways] =
    await Promise.all([
      supabase
        .from('student_guardians')
        .select(
          `student_id, guardian_id, relationship, is_primary, is_emergency_contact, is_fee_payer,
           guardian:guardians(id, full_name, national_id, phone, email, occupation, address,
             is_deceased, absence_reason)`,
        )
        .eq('student_id', studentId),
      supabase
        .from('student_medical')
        .select('blood_group, allergies, conditions, emergency_contact, strengths, challenges')
        .eq('student_id', studentId)
        .maybeSingle(),
      supabase
        .from('student_logistics')
        .select('transport_mode, transport_route, boarding_status')
        .eq('student_id', studentId)
        .maybeSingle(),
      supabase
        .from('student_consents')
        .select('consent_kind, granted, lawful_basis, granted_at, granted_by')
        .eq('student_id', studentId),
      supabase
        .from('student_documents')
        .select('id, kind, storage_path, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false }),
      supabase.from('student_subjects').select('subject_id, selection_cutoff_at').eq('student_id', studentId),
      supabase
        .from('streams')
        .select('id, stream_label, class_id')
        .eq('academic_year_id', period?.academicYearId ?? '__none__')
        .order('stream_label'),
      student.pathway_id
        ? supabase.from('pathways').select('code, name').eq('id', student.pathway_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

  // Streams need their class labels, which is a second lookup; the ids come from
  // the same year-scoped set so this stays cheap.
  const classIds = [...new Set((streams.data ?? []).map((s) => s.class_id))]
  const { data: classes } = classIds.length
    ? await supabase.from('classes').select('id, label').in('id', classIds)
    : { data: [] as { id: string; label: string }[] }

  const classLabel = new Map((classes ?? []).map((c) => [c.id, c.label]))

  const currentStream = (streams.data ?? []).find((s) => s.id === student.current_stream_id)
  const currentClassLabel = currentStream ? classLabel.get(currentStream.class_id) : undefined

  // Subject names for the Academic tab, senior mode only.
  const subjectIds = (subjects.data ?? []).map((s) => s.subject_id)
  const { data: subjectRows } = subjectIds.length
    ? await supabase.from('subjects').select('id, code, name, is_core').in('id', subjectIds)
    : { data: [] as { id: string; code: string; name: string; is_core: boolean }[] }
  const subjectById = new Map((subjectRows ?? []).map((s) => [s.id, s]))

  // A pathway's own subject list explains whether a subject is compulsory or an
  // elective the learner chose.
  let pathwayRequirements = new Map<string, string>()
  if (student.pathway_id) {
    const { data: psRows } = await supabase
      .from('pathway_subjects')
      .select('subject_id, requirement')
      .eq('pathway_id', student.pathway_id)
    pathwayRequirements = new Map((psRows ?? []).map((p) => [p.subject_id, p.requirement]))
  }

  const cutoffs = new Map(
    (subjects.data ?? []).map((s) => [s.subject_id, s.selection_cutoff_at]),
  )

  const parts = [student.first_name, student.other_names, student.surname].filter(Boolean)

  return {
    id: student.id,
    studentNo: student.student_no,
    firstName: student.first_name,
    otherNames: student.other_names,
    surname: student.surname,
    fullName: parts.join(' '),
    gender: student.gender,
    dateOfBirth: student.date_of_birth,
    status: student.status,
    nationality: student.nationality,
    county: student.county,
    subCounty: student.sub_county,
    upi: student.upi,
    birthCertNo: student.birth_cert_no,
    address: student.address,
    phone: student.phone,
    email: student.email,
    photoUrl: student.photo_url,
    admittedOn: student.admitted_on,
    streamId: student.current_stream_id,
    streamLabel: currentStream?.stream_label ?? null,
    classLabel: currentClassLabel ?? null,
    pathwayCode: pathways.data?.code ?? null,
    pathwayName: pathways.data?.name ?? null,
    track: student.track,
    assessmentNumber: student.assessment_number,
    previousSchool: student.previous_school,
    transferReason: student.transfer_reason,
    orphanStatus: student.orphan_status ?? 'none',
    tuitionWaiver: student.tuition_waiver ?? false,
    house: student.house,

    guardians: (links.data ?? []).flatMap((l) => {
      const g = Array.isArray(l.guardian) ? l.guardian[0] : l.guardian
      if (!g) return []
      return [
        {
          // student_guardians has no surrogate key; the pair is the key.
          linkId: `${l.student_id}:${l.guardian_id}`,
          guardianId: g.id,
          fullName: g.full_name,
          nationalId: g.national_id,
          phone: g.phone,
          email: g.email,
          occupation: g.occupation,
          address: g.address,
          isDeceased: g.is_deceased ?? false,
          absenceReason: g.absence_reason,
          relationship: l.relationship,
          isPrimary: l.is_primary,
          isEmergencyContact: l.is_emergency_contact,
          isFeePayer: l.is_fee_payer,
        },
      ]
    }),

    medical: medical.data
      ? {
          bloodGroup: medical.data.blood_group,
          allergies: medical.data.allergies,
          conditions: medical.data.conditions,
          emergencyContact: medical.data.emergency_contact,
          strengths: medical.data.strengths,
          challenges: medical.data.challenges,
        }
      : EMPTY,

    logistics: logistics.data
      ? {
          transportMode: logistics.data.transport_mode,
          transportRoute: logistics.data.transport_route,
          boardingStatus: logistics.data.boarding_status,
        }
      : null,

    consents: (consents.data ?? []).map((c) => ({
      consentKind: c.consent_kind as RecordConsent['consentKind'],
      granted: c.granted,
      lawfulBasis: c.lawful_basis,
      grantedAt: c.granted_at,
      grantedByName: null,
    })),

    documents: (documents.data ?? []).map((d) => ({
      id: d.id,
      kind: d.kind,
      storagePath: d.storage_path,
      createdAt: d.created_at,
    })),

    subjects: [...subjectById.values()]
      .map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        isCore: s.is_core,
        requirement: pathwayRequirements.get(s.id) ?? null,
        selectionCutoffAt: cutoffs.get(s.id) ?? null,
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),

    streams: (streams.data ?? []).map((s) => ({
      id: s.id,
      label: s.stream_label,
      classLabel: classLabel.get(s.class_id) ?? '',
    })),
  }
}