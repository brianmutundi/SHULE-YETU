import { getSessionContext } from '@/lib/auth/session'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAcademicPeriod } from '@/lib/auth/period'
import { todayInNairobi } from '@/lib/dates'
import type { Database } from '@/lib/supabase/types'

type StudentStatus = Database['public']['Enums']['student_status']
type StudentGender = Database['public']['Enums']['student_gender']

export interface StudentRow {
  id: string
  studentNo: string
  firstName: string
  otherNames: string | null
  surname: string | null
  fullName: string
  gender: StudentGender
  dateOfBirth: string
  status: StudentStatus
  streamId: string | null
  streamLabel: string | null
  classLabel: string | null
  admittedOn: string | null
}

export interface DirectoryFilters {
  search?: string
  status?: StudentStatus | 'all'
  classId?: string
  streamId?: string
  gender?: StudentGender | 'all'
  page: number
  pageSize: number
}

export interface DirectoryResult {
  rows: StudentRow[]
  total: number
  page: number
  pageSize: number
  stats: DirectoryStats
}

export interface DirectoryStats {
  total: number
  active: number
  inactive: number
  graduated: number
  completed: number
  male: number
  female: number
  newThisTerm: number
}

export interface FilterOptions {
  classes: { id: string; label: string }[]
  streams: { id: string; label: string; classId: string }[]
}

/**
 * Student directory with server-side filtering, search and pagination.
 *
 * Counted in SQL rather than by fetching rows, so the pager stays correct on
 * large schools. Search uses ILIKE over the trigram-indexed name columns.
 */
export async function getStudentDirectory(
  filters: DirectoryFilters,
): Promise<DirectoryResult> {
  await connection()

  const session = await getSessionContext()
  const supabase = await createClient()

  const from = (filters.page - 1) * filters.pageSize
  const to = from + filters.pageSize - 1

  let query = supabase
    .from('students')
    .select('id, student_no, first_name, other_names, surname, gender, date_of_birth, status, current_stream_id, admitted_on', {
      count: 'exact',
    })
    .eq('tenant_id', session.tenantId)
    .is('deleted_at', null)
    .order('surname', { ascending: true, nullsFirst: false })
    .order('first_name', { ascending: true })
    .range(from, to)

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  if (filters.gender && filters.gender !== 'all') {
    query = query.eq('gender', filters.gender)
  }
  if (filters.streamId) {
    query = query.eq('current_stream_id', filters.streamId)
  }
  if (filters.search && filters.search.trim().length > 0) {
    const term = `%${filters.search.trim()}%`
    query = query.or(
      `first_name.ilike.${term},other_names.ilike.${term},surname.ilike.${term},student_no.ilike.${term}`,
    )
  }

  const { data, count, error } = await query

  if (error) throw new Error(error.message)

  const streamIds = [...new Set((data ?? []).map((r) => r.current_stream_id).filter(Boolean))] as string[]

  let streamMap = new Map<string, { label: string; classLabel: string }>()
  let classMap = new Map<string, string>()

  if (streamIds.length > 0) {
    const { data: streams } = await supabase
      .from('streams')
      .select('id, stream_label, class_id')
      .in('id', streamIds)

    classMap = new Map()
    const classIds = [...new Set((streams ?? []).map((s) => s.class_id))]
    if (classIds.length > 0) {
      const { data: classes } = await supabase
        .from('classes')
        .select('id, label')
        .in('id', classIds)
      classMap = new Map((classes ?? []).map((c) => [c.id, c.label]))
    }

    streamMap = new Map(
      (streams ?? []).map((s) => [
        s.id,
        { label: s.stream_label, classLabel: classMap.get(s.class_id) ?? '' },
      ]),
    )
  }

  const rows: StudentRow[] = (data ?? []).map((row) => {
    const stream = row.current_stream_id ? streamMap.get(row.current_stream_id) : undefined
    const parts = [row.first_name, row.other_names, row.surname].filter(Boolean)
    return {
      id: row.id,
      studentNo: row.student_no,
      firstName: row.first_name,
      otherNames: row.other_names,
      surname: row.surname,
      fullName: parts.join(' '),
      gender: row.gender,
      dateOfBirth: row.date_of_birth,
      status: row.status,
      streamId: row.current_stream_id,
      streamLabel: stream ? `${stream.classLabel} ${stream.label}`.trim() : null,
      classLabel: stream?.classLabel ?? null,
      admittedOn: row.admitted_on,
    }
  })

  const { data: statsRaw } = await supabase.rpc('student_directory_stats')
  const stats = (statsRaw as unknown as DirectoryStats) ?? {
    total: count ?? 0,
    active: 0,
    inactive: 0,
    graduated: 0,
    completed: 0,
    male: 0,
    female: 0,
    newThisTerm: 0,
  }

  return {
    rows,
    total: count ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
    stats,
  }
}

export async function getFilterOptions(academicYearId: string): Promise<FilterOptions> {
  await connection()

  const supabase = await createClient()

  const [{ data: classes }, { data: streams }] = await Promise.all([
    supabase.from('classes').select('id, label').order('sort_order'),
    supabase
      .from('streams')
      .select('id, stream_label, class_id')
      .eq('academic_year_id', academicYearId)
      .order('stream_label'),
  ])

  return {
    classes: (classes ?? []).map((c) => ({ id: c.id, label: c.label })),
    streams: (streams ?? []).map((s) => ({
      id: s.id,
      label: s.stream_label,
      classId: s.class_id,
    })),
  }
}

export interface RegistrationOptions extends FilterOptions {
  terms: { id: string; name: string }[]
  /** The selected term, preselected in the form. */
  defaultTermId: string | null
  /** yyyy-MM-dd in Africa/Nairobi, the default admission date. */
  today: string
}

/** Everything the registration modal needs, resolved on the server. */
export async function getRegistrationOptions(): Promise<RegistrationOptions> {
  const { period, terms } = await getAcademicPeriod()
  const filters = period
    ? await getFilterOptions(period.academicYearId)
    : { classes: [], streams: [] }

  return {
    ...filters,
    terms: terms.map((t) => ({ id: t.id, name: t.name })),
    defaultTermId: period?.sessionId ?? null,
    today: todayInNairobi(),
  }
}
