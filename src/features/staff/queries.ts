import 'server-only'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAcademicPeriod } from '@/lib/auth/period'
import { canViewSensitiveFinance } from '@/lib/auth/guards'
import { getSessionContext } from '@/lib/auth/session'
import type { Employer, StaffStatus, StaffType } from './schema'

/**
 * Staff directory reads (CLAUDE.md section 7.12).
 *
 * One read through the staff_directory view, which already decides whether the
 * caller may see the national identifiers. The identifiers are nulled in SQL by
 * app.can_view_sensitive_finance(), so this module never has to filter them
 * itself: hiding them here instead would leave them readable by anyone who
 * queried the view directly.
 */

export interface StaffAssignment {
  scope: 'class_teacher' | 'subject_teacher'
  classId: string | null
  streamId: string | null
  streamLabel: string | null
  classLabel: string | null
  subjectCode: string | null
  learningArea: string | null
}

export interface StaffRow {
  id: string
  fullName: string
  gender: string | null
  staffType: StaffType
  employer: Employer
  employmentType: string | null
  tscNumber: string | null
  phone: string | null
  email: string | null
  address: string | null
  hiredOn: string | null
  status: StaffStatus
  /** Null unless the caller may see them; the view enforces this. */
  kraPin: string | null
  nssfShaNumber: string | null
  nationalId: string | null
  assignments: StaffAssignment[]
}

export interface DirectoryFilters {
  search?: string
  staffType?: StaffType | 'all'
  employer?: Employer | 'all'
  status?: StaffStatus | 'all'
}

export interface StaffStats {
  total: number
  teaching: number
  nonTeaching: number
  admin: number
  bom: number
  tsc: number
  active: number
}

export interface DirectoryResult {
  rows: StaffRow[]
  stats: StaffStats
  /** Whether this caller may see KRA PIN and NSSF/SHA numbers. */
  canSeeSensitive: boolean
}

export async function getStaffDirectory(filters: DirectoryFilters): Promise<DirectoryResult> {
  await connection()

  const session = await getSessionContext()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('staff_directory')
    .select('*')
    .eq('tenant_id', session.tenantId)
    .order('full_name')

  if (error) throw new Error(error.message)

  const all = (data ?? []) as unknown as StaffRow[]
  const canSeeSensitive = canViewSensitiveFinance(session.role)

  // Filtered here rather than in the query because the directory is small and a
  // school has tens of staff, not thousands. Pagination here would be premature;
  // the learner directory is the one that needs server-side paging.
  const search = filters.search?.trim().toLowerCase() ?? ''

  const rows = all.filter((row) => {
    if (filters.staffType && filters.staffType !== 'all' && row.staffType !== filters.staffType) {
      return false
    }
    if (filters.employer && filters.employer !== 'all' && row.employer !== filters.employer) {
      return false
    }
    if (filters.status && filters.status !== 'all' && row.status !== filters.status) {
      return false
    }
    if (search && !row.fullName.toLowerCase().includes(search)) return false
    return true
  })

  return {
    rows,
    canSeeSensitive,
    stats: {
      total: all.length,
      teaching: all.filter((r) => r.staffType === 'teaching').length,
      nonTeaching: all.filter((r) => r.staffType === 'non_teaching').length,
      admin: all.filter((r) => r.staffType === 'admin').length,
      bom: all.filter((r) => r.staffType === 'bom').length,
      tsc: all.filter((r) => r.employer === 'tsc').length,
      active: all.filter((r) => r.status === 'active').length,
    },
  }
}

export async function getStaffMember(id: string): Promise<StaffRow | null> {
  await connection()

  const supabase = await createClient()

  const { data } = await supabase
    .from('staff_directory')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  return (data as unknown as StaffRow) ?? null
}

/**
 * Streams, subjects and learning areas for the assignment form.
 *
 * Scoped to the current academic year: an assignment belongs to a year and
 * expires with it, so offering last year's streams would create assignments
 * that can never be marked against.
 */
export async function getAssignmentOptions() {
  await connection()

  const supabase = await createClient()
  const { period } = await getAcademicPeriod()

  if (!period) {
    return { streams: [], subjects: [], learningAreas: [], academicYears: [] }
  }

  const [{ data: streams }, { data: classes }, { data: subjects }, { data: areas }, { data: years }] =
    await Promise.all([
      supabase
        .from('streams')
        .select('id, stream_label, class_id')
        .eq('academic_year_id', period.academicYearId)
        .order('stream_label'),
      supabase.from('classes').select('id, label').order('sort_order'),
      supabase.from('subjects').select('id, code, name').order('code'),
      supabase.from('learning_areas').select('id, name').order('sort_order'),
      supabase.from('academic_years').select('id, calendar_year').order('calendar_year', {
        ascending: false,
      }),
    ])

  const classLabel = new Map((classes ?? []).map((c) => [c.id, c.label]))

  return {
    streams: (streams ?? []).map((s) => ({
      id: s.id,
      label: `${classLabel.get(s.class_id) ?? ''} ${s.stream_label}`.trim(),
      classLabel: classLabel.get(s.class_id) ?? '',
    })),
    subjects: (subjects ?? []).map((s) => ({ id: s.id, code: s.code, name: s.name })),
    learningAreas: (areas ?? []).map((a) => ({ id: a.id, name: a.name })),
    academicYears: (years ?? []).map((y) => ({ id: y.id, calendarYear: y.calendar_year })),
  }
}