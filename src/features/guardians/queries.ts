import 'server-only'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface GuardianSummary {
  id: string
  fullName: string
  phone: string
  email: string | null
  occupation: string | null
  nationalId: string | null
  address: string | null
  isDeceased: boolean
  absenceReason: string | null
}

export interface LinkedStudent {
  linkId: string
  studentId: string
  studentNo: string
  fullName: string
  status: string
  streamLabel: string | null
  relationship: string
  isPrimary: boolean
  isEmergencyContact: boolean
  isFeePayer: boolean
}

export interface GuardianWithStudents extends GuardianSummary {
  links: LinkedStudent[]
  relationship: string | null
}

export interface MasterStudent {
  id: string
  studentNo: string
  fullName: string
  firstName: string
  otherNames: string | null
  surname: string | null
  gender: string
  dateOfBirth: string
  status: string
  streamLabel: string | null
  classLabel: string | null
  phone: string | null
  county: string | null
  guardians: {
    linkId: string
    id: string
    fullName: string
    phone: string
    relationship: string
    isPrimary: boolean
    isFeePayer: boolean
  }[]
}

/**
 * Guardians with their linked learners.
 *
 * Loaded in one pass: guardians, links, then the students and streams those
 * links point at. Avoids the N+1 that a per-guardian lookup would produce on
 * a school with hundreds of families.
 */
export async function getGuardiansWithStudents(search = ''): Promise<GuardianWithStudents[]> {
  await connection()

  const supabase = await createClient()

  let guardianQuery = supabase
    .from('guardians')
    .select('id, full_name, phone, email, occupation, national_id, address, is_deceased, absence_reason')
    .order('full_name')

  if (search.trim()) {
    const term = `%${search.trim()}%`
    guardianQuery = guardianQuery.or(`full_name.ilike.${term},phone.ilike.${term}`)
  }

  const { data: guardians, error } = await guardianQuery
  if (error) throw new Error(error.message)

  const guardianIds = (guardians ?? []).map((g) => g.id)
  if (guardianIds.length === 0) return []

  const { data: links } = await supabase
    .from('student_guardians')
    .select('student_id, guardian_id, relationship, is_primary, is_emergency_contact, is_fee_payer')
    .in('guardian_id', guardianIds)

  const studentIds = [...new Set((links ?? []).map((l) => l.student_id))]

  const studentsById = new Map<
    string,
    { id: string; student_no: string; first_name: string; other_names: string | null; surname: string | null; status: string; current_stream_id: string | null }
  >()
  let streamById: Map<string, string> = new Map()

  if (studentIds.length > 0) {
    const { data: students } = await supabase
      .from('students')
      .select('id, student_no, first_name, other_names, surname, status, current_stream_id')
      .in('id', studentIds)
      .is('deleted_at', null)

    for (const s of students ?? []) studentsById.set(s.id, s)

    const streamIds = [...new Set((students ?? []).map((s) => s.current_stream_id).filter(Boolean))] as string[]
    if (streamIds.length > 0) {
      const { data: streams } = await supabase
        .from('streams')
        .select('id, stream_label')
        .in('id', streamIds)
      streamById = new Map((streams ?? []).map((s) => [s.id, s.stream_label]))
    }
  }

  const linksByGuardian = new Map<string, LinkedStudent[]>()
  for (const link of links ?? []) {
    const student = studentsById.get(link.student_id)
    if (!student) continue
    const parts = [student.first_name, student.other_names, student.surname].filter(Boolean)
    const entry: LinkedStudent = {
      linkId: `${link.guardian_id}:${link.student_id}`,
      studentId: student.id,
      studentNo: student.student_no,
      fullName: parts.join(' '),
      status: student.status,
      streamLabel: student.current_stream_id
        ? (streamById.get(student.current_stream_id) ?? null)
        : null,
      relationship: link.relationship,
      isPrimary: link.is_primary,
      isEmergencyContact: link.is_emergency_contact,
      isFeePayer: link.is_fee_payer,
    }
    const list = linksByGuardian.get(link.guardian_id) ?? []
    list.push(entry)
    linksByGuardian.set(link.guardian_id, list)
  }

  return (guardians ?? []).map((g) => {
    const linksForGuardian = linksByGuardian.get(g.id) ?? []
    return {
      id: g.id,
      fullName: g.full_name,
      phone: g.phone,
      email: g.email,
      occupation: g.occupation,
      nationalId: g.national_id,
      address: g.address,
      isDeceased: g.is_deceased,
      absenceReason: g.absence_reason,
      links: linksForGuardian,
      relationship: linksForGuardian[0]?.relationship ?? null,
    }
  })
}

/** Full profile for the selected learner, including their guardians. */
export async function getStudentProfile(studentId: string): Promise<MasterStudent | null> {
  await connection()

  const supabase = await createClient()

  const { data: student } = await supabase
    .from('students')
    .select('id, student_no, first_name, other_names, surname, gender, date_of_birth, status, phone, county, current_stream_id, admitted_class_id')
    .eq('id', studentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!student) return null

  let streamLabel: string | null = null
  if (student.current_stream_id) {
    const { data: stream } = await supabase
      .from('streams')
      .select('stream_label')
      .eq('id', student.current_stream_id)
      .maybeSingle()
    streamLabel = stream?.stream_label ?? null
  }

  let classLabel: string | null = null
  if (student.admitted_class_id) {
    const { data: cls } = await supabase
      .from('classes')
      .select('label')
      .eq('id', student.admitted_class_id)
      .maybeSingle()
    classLabel = cls?.label ?? null
  }

  const { data: links } = await supabase
    .from('student_guardians')
    .select('guardian_id, relationship, is_primary, is_fee_payer')
    .eq('student_id', student.id)

  const guardianIds = (links ?? []).map((l) => l.guardian_id)
  const guardianById = new Map<
    string,
    { id: string; full_name: string; phone: string }
  >()

  if (guardianIds.length > 0) {
    const { data: guardians } = await supabase
      .from('guardians')
      .select('id, full_name, phone')
      .in('id', guardianIds)
    for (const g of guardians ?? []) guardianById.set(g.id, g)
  }

  const parts = [student.first_name, student.other_names, student.surname].filter(Boolean)

  return {
    id: student.id,
    studentNo: student.student_no,
    fullName: parts.join(' '),
    firstName: student.first_name,
    otherNames: student.other_names,
    surname: student.surname,
    gender: student.gender,
    dateOfBirth: student.date_of_birth,
    status: student.status,
    streamLabel,
    classLabel: classLabel && streamLabel ? `${classLabel} ${streamLabel}` : classLabel,
    phone: student.phone,
    county: student.county,
    guardians: (links ?? []).flatMap((link) => {
      const guardian = guardianById.get(link.guardian_id)
      if (!guardian) return []
      return [
        {
          linkId: `${link.guardian_id}:${student.id}`,
          id: guardian.id,
          fullName: guardian.full_name,
          phone: guardian.phone,
          relationship: link.relationship,
          isPrimary: link.is_primary,
          isFeePayer: link.is_fee_payer,
        },
      ]
    }),
  }
}

/** Lightweight row for the master-detail left pane. */
export interface MasterStudentListItem {
  id: string
  studentNo: string
  fullName: string
  gender: string
  status: string
  streamLabel: string | null
}

/** Learner list for the master-detail left pane. */
export async function getMasterStudents(search = ''): Promise<MasterStudentListItem[]> {
  await connection()

  const supabase = await createClient()

  let query = supabase
    .from('students')
    .select('id, student_no, first_name, other_names, surname, gender, status, current_stream_id')
    .is('deleted_at', null)
    .order('first_name')
    .limit(200)

  if (search.trim()) {
    const term = `%${search.trim()}%`
    query = query.or(`first_name.ilike.${term},surname.ilike.${term},student_no.ilike.${term}`)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const streamIds = [...new Set((data ?? []).map((r) => r.current_stream_id).filter(Boolean))] as string[]
  let streamById: Map<string, string> = new Map()
  if (streamIds.length > 0) {
    const { data: streams } = await supabase.from('streams').select('id, stream_label').in('id', streamIds)
    streamById = new Map((streams ?? []).map((s) => [s.id, s.stream_label]))
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    studentNo: row.student_no,
    fullName: [row.first_name, row.other_names, row.surname].filter(Boolean).join(' '),
    gender: row.gender,
    status: row.status,
    streamLabel: row.current_stream_id ? (streamById.get(row.current_stream_id) ?? null) : null,
  }))
}

/**
 * Resolve an admission number to a learner name for the Link Student dialog.
 *
 * Read-only and narrow: returns just enough to confirm a match.
 */
export async function resolveStudentNo(
  studentNo: string,
): Promise<{ id: string; fullName: string } | null> {
  await connection()

  const supabase = await createClient()

  const { data } = await supabase
    .from('students')
    .select('id, first_name, other_names, surname')
    .eq('student_no', studentNo.trim())
    .is('deleted_at', null)
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    fullName: [data.first_name, data.other_names, data.surname].filter(Boolean).join(' '),
  }
}