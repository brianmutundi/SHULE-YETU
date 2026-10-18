import 'server-only'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAcademicPeriod } from '@/lib/auth/period'
import { getSessionContext } from '@/lib/auth/session'
import type { AppRole } from '@/lib/auth/permissions'
import type { AttendanceStatus, ExcuseReason, SheetRow } from './schema'

/**
 * Attendance reads (CLAUDE.md section 7.11).
 *
 * The sheet comes from app.attendance_sheet() rather than a client-side join so
 * the learner list, today's mark and the rate to date are one consistent read.
 * Building it in the browser would mean fetching every learner and every
 * attendance record to compute a rate SQL can compute in the same pass.
 */

export interface StreamOption {
  id: string
  label: string
  classLabel: string
  streamLabel: string
  /** Whether the caller may mark this stream; drives the list's affordances. */
  canMark: boolean
}

export interface AttendanceSheet {
  rows: SheetRow[]
  /** True once at least one learner has a mark for this date. */
  isMarked: boolean
  canMark: boolean
}

export async function getSheet(streamId: string, date: string): Promise<AttendanceSheet> {
  await connection()

  const supabase = await createClient()

  const [{ data, error }, canMark] = await Promise.all([
    supabase.rpc('attendance_sheet', { p_stream: streamId, p_date: date }),
    supabase.rpc('can_mark_stream', { p_stream: streamId, p_date: date }),
  ])

  if (error) throw new Error(error.message)

  const rows = ((data ?? []) as unknown as {
    student_id: string
    student_no: string
    full_name: string
    photo_url: string | null
    status: AttendanceStatus | null
    excuse_reason: ExcuseReason | null
    note: string | null
    marked_at: string | null
    rate: string | null
  }[]).map((r) => ({
    studentId: r.student_id,
    studentNo: r.student_no,
    fullName: r.full_name,
    photoUrl: r.photo_url,
    status: r.status,
    excuseReason: r.excuse_reason,
    note: r.note,
    markedAt: r.marked_at,
    rate: r.rate === null ? null : Number(r.rate),
  }))

  return {
    rows,
    isMarked: rows.some((r) => r.status !== null),
    // canMark comes back as the scalar the function returns, so the response
    // object is unwrapped rather than compared whole.
    canMark: canMark.data === true,
  }
}

/**
 * Streams the caller can see, with whether they may mark each.
 *
 * A teacher's own classes come first: they are the ones they came here for, and
 * listing every stream in the school first would bury them.
 */
export async function getStreamOptions(): Promise<StreamOption[]> {
  await connection()

  const supabase = await createClient()
  const session = await getSessionContext()
  const { period } = await getAcademicPeriod()

  if (!period) return []

  const { data: streams } = await supabase
    .from('streams')
    .select('id, stream_label, class_id')
    .eq('academic_year_id', period.academicYearId)
    .order('stream_label')

  if (!streams || streams.length === 0) return []

  const { data: classes } = await supabase
    .from('classes')
    .select('id, label')
    .order('sort_order')

  const classLabel = new Map((classes ?? []).map((c) => [c.id, c.label]))

  // Which streams this caller may mark, resolved from their own assignments in
  // one query rather than by calling can_mark_stream once per stream.
  const { data: assignments } = await supabase
    .from('teaching_assignments')
    .select('stream_id, staff:staff_id(profile_id)')
    .eq('academic_year_id', period.academicYearId)

  const mine = new Set(
    ((assignments ?? []) as unknown as { stream_id: string; staff: { profile_id: string | null } }[])
      .filter((a) => a.staff?.profile_id === session.userId)
      .map((a) => a.stream_id),
  )

  const options = streams.map((s) => ({
    id: s.id,
    label: `${classLabel.get(s.class_id) ?? ''} ${s.stream_label}`.trim(),
    classLabel: classLabel.get(s.class_id) ?? '',
    streamLabel: s.stream_label,
    // Mirrors app.can_mark_stream(). The database is the authority; this only
    // decides what the list offers before the sheet is opened.
    canMark: canOverseeAttendance(session.role) || mine.has(s.id),
  }))

  return options.sort((a, b) => {
    if (a.canMark !== b.canMark) return a.canMark ? -1 : 1
    return a.label.localeCompare(b.label)
  })
}

/** The roles allowed to mark any stream, mirroring app.can_mark_stream(). */
function canOverseeAttendance(role: AppRole): boolean {
  return (
    role === 'owner' ||
    role === 'admin' ||
    role === 'head_teacher' ||
    role === 'deputy_head' ||
    role === 'registrar'
  )
}

/** Register totals for the header strip. */
export async function getSummary(from: string, to: string) {
  await connection()

  const supabase = await createClient()
  const { data } = await supabase.rpc('attendance_summary', {
    p_from: from,
    p_to: to,
  })

  const row = (data ?? [])[0] as
    | {
        enrolled: number
        present: number
        absent: number
        late: number
        excused: number
        unmarked_today: number
      }
    | undefined

  return {
    enrolled: row?.enrolled ?? 0,
    present: row?.present ?? 0,
    absent: row?.absent ?? 0,
    late: row?.late ?? 0,
    excused: row?.excused ?? 0,
    unmarkedToday: row?.unmarked_today ?? 0,
  }
}