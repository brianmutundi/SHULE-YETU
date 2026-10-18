import 'server-only'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAcademicPeriod } from '@/lib/auth/period'
import { getSessionContext } from '@/lib/auth/session'
import type { GridRow, PerformanceLevel } from './schema'

/**
 * Assessment reads (CLAUDE.md section 7.15).
 *
 * The rubric, the grid and the aggregate are all read from SQL functions. The
 * alternative is pulling every mark for a stream into the browser to average in
 * JavaScript, which is both slower and a chance for the two to disagree.
 */

export interface AreaOption {
  id: string
  name: string
}

export interface SubjectOption {
  id: string
  code: string
  name: string
}

export interface StreamOption {
  id: string
  label: string
}

export interface TaskOption {
  id: string
  name: string
  category: string
  learningAreaName: string | null
  subjectCode: string | null
  subjectName: string | null
  maxScore: number | null
  weight: number | null
  sessionName: string | null
  gradedCount: number
}

export async function getRubric(scale?: 'eight_point' | 'four_point'): Promise<PerformanceLevel[]> {
  await connection()

  const supabase = await createClient()
  const session = await getSessionContext()

  let query = supabase
    .from('performance_levels')
    .select('id, scale, code, points, descriptor, sort_order')
    .eq('tenant_id', session.tenantId)

  if (scale) query = query.eq('scale', scale)

  const { data } = await query.order('scale').order('sort_order')

  return ((data ?? []) as {
    id: string
    scale: 'eight_point' | 'four_point'
    code: string
    points: number
    descriptor: string | null
    sort_order: number
  }[]).map((r) => ({
    id: r.id,
    scale: r.scale,
    code: r.code,
    points: Number(r.points),
    descriptor: r.descriptor,
    sortOrder: r.sort_order,
  }))
}

export async function getAreas(): Promise<AreaOption[]> {
  await connection()

  const supabase = await createClient()
  const session = await getSessionContext()

  const { data } = await supabase
    .from('learning_areas')
    .select('id, name')
    .eq('tenant_id', session.tenantId)
    .order('sort_order')

  return (data ?? []).map((a) => ({ id: a.id, name: a.name }))
}

export async function getSubjects(): Promise<SubjectOption[]> {
  await connection()

  const supabase = await createClient()
  const session = await getSessionContext()

  const { data } = await supabase
    .from('subjects')
    .select('id, code, name')
    .eq('tenant_id', session.tenantId)
    .order('code')

  return (data ?? []).map((s) => ({ id: s.id, code: s.code, name: s.name }))
}

export async function getStreams(): Promise<StreamOption[]> {
  await connection()

  const supabase = await createClient()
  const { period } = await getAcademicPeriod()

  if (!period) return []

  const [{ data: streams }, { data: classes }] = await Promise.all([
    supabase
      .from('streams')
      .select('id, stream_label, class_id')
      .eq('academic_year_id', period.academicYearId)
      .order('stream_label'),
    supabase.from('classes').select('id, label').order('sort_order'),
  ])

  const classLabel = new Map((classes ?? []).map((c) => [c.id, c.label]))

  return (streams ?? []).map((s) => ({
    id: s.id,
    label: `${classLabel.get(s.class_id) ?? ''} ${s.stream_label}`.trim(),
  }))
}

/**
 * Assessment tasks for this school.
 *
 * graded_count comes from a left join rather than a second query, so the list
 * shows which assessments have marks and which are still blank.
 */
export async function getTasks(limit = 50): Promise<TaskOption[]> {
  await connection()

  const supabase = await createClient()
  const session = await getSessionContext()

  const { data } = await supabase
    .from('assessment_tasks')
    .select(
      'id, name, category, learning_area_id, subject_id, max_score, weight, session_id, sessions(name)',
    )
    .eq('tenant_id', session.tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!data || data.length === 0) return []

  const [{ data: areas }, { data: subjects }, { data: marks }] = await Promise.all([
    supabase.from('learning_areas').select('id, name').eq('tenant_id', session.tenantId),
    supabase.from('subjects').select('id, code, name').eq('tenant_id', session.tenantId),
    supabase.from('marks').select('assessment_task_id').eq('tenant_id', session.tenantId),
  ])

  const areaName = new Map((areas ?? []).map((a) => [a.id, a.name]))
  const subjectById = new Map((subjects ?? []).map((s) => [s.id, s]))

  const graded = new Map<string, number>()
  for (const m of marks ?? []) {
    graded.set(m.assessment_task_id, (graded.get(m.assessment_task_id) ?? 0) + 1)
  }

  return data.map((t) => {
    const subject = t.subject_id ? subjectById.get(t.subject_id) : undefined

    return {
      id: t.id,
      name: t.name,
      category: t.category,
      learningAreaName: t.learning_area_id ? (areaName.get(t.learning_area_id) ?? null) : null,
      subjectCode: subject?.code ?? null,
      subjectName: subject?.name ?? null,
      maxScore: t.max_score === null ? null : Number(t.max_score),
      weight: t.weight === null ? null : Number(t.weight),
      sessionName: (t.sessions as { name: string } | null)?.name ?? null,
      gradedCount: graded.get(t.id) ?? 0,
    }
  })
}

/** The entry grid for one task and stream. */
export async function getMarksGrid(taskId: string, streamId: string): Promise<GridRow[]> {
  await connection()

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('marks_grid', {
    p_task: taskId,
    p_stream: streamId,
  })

  if (error) throw new Error(error.message)

  return ((data ?? []) as {
    student_id: string
    student_no: string
    full_name: string
    performance_level_code: string | null
    score: number | null
    note: string | null
    graded_at: string | null
  }[]).map((r) => ({
    studentId: r.student_id,
    studentNo: r.student_no,
    fullName: r.full_name,
    performanceLevelCode: r.performance_level_code,
    score: r.score === null ? null : Number(r.score),
    note: r.note,
    gradedAt: r.graded_at,
  }))
}

/**
 * One learner's results for a term, for the report card.
 *
 * Basic mode returns competency levels per learning area; senior mode returns
 * scores per subject. Both come back in one shape so the PDF renderer does not
 * have to branch on the mode for its layout, only for its labels.
 */
export interface ReportLine {
  key: string
  label: string
  detail: string | null
  code: string | null
  score: number | null
  maxScore: number | null
  points: number | null
}

export interface ReportData {
  studentName: string
  admissionNo: string
  classLabel: string
  streamLabel: string
  termName: string
  calendarYear: number
  lines: ReportLine[]
  /** Attendance summary for the term, counted in SQL. */
  attendance: { present: number; absent: number; late: number; excused: number; rate: number | null }
}

export async function getReportData(studentId: string, sessionId: string): Promise<ReportData | null> {
  await connection()

  const supabase = await createClient()
  const session = await getSessionContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, student_no, first_name, other_names, surname, current_stream_id, streams!left(class_id, streams!inner(stream_label, classes!inner(label)))')
    .eq('id', studentId)
    .single()

  if (!student) return null

  const streamInfo = student.streams as unknown as
    | { stream_label: string; classes: { label: string } | null }
    | null

  const { data: term } = await supabase
    .from('sessions')
    .select('name, opened_on, closing_on, academic_years!inner(calendar_year)')
    .eq('id', sessionId)
    .single()

  if (!term) return null

  const academicYear = (term.academic_years as unknown as { calendar_year: number }).calendar_year

  const { data: marks } = await supabase
    .from('marks')
    .select(
      'performance_level_code, score, assessment_tasks!inner(id, name, max_score, learning_area_id, subject_id, session_id)',
    )
    .eq('student_id', studentId)
    .eq('assessment_tasks.session_id', sessionId)

  const [{ data: areas }, { data: subjects }, { data: levels }] = await Promise.all([
    supabase.from('learning_areas').select('id, name').eq('tenant_id', session.tenantId),
    supabase.from('subjects').select('id, code, name').eq('tenant_id', session.tenantId),
    supabase.from('performance_levels').select('code, points').eq('tenant_id', session.tenantId),
  ])

  const areaName = new Map((areas ?? []).map((a) => [a.id, a.name]))
  const subjectById = new Map((subjects ?? []).map((s) => [s.id, s]))
  const pointsByCode = new Map((levels ?? []).map((l) => [l.code, Number(l.points)]))

  const lines: ReportLine[] = ((marks ?? []) as unknown as {
    performance_level_code: string | null
    score: number | null
    assessment_tasks: {
      id: string
      name: string
      max_score: number | null
      learning_area_id: string | null
      subject_id: string | null
      session_id: string
    }
  }[]).map((m) => {
    const task = m.assessment_tasks
    const subject = task.subject_id ? subjectById.get(task.subject_id) : undefined

    return {
      key: task.id,
      label: task.learning_area_id
        ? (areaName.get(task.learning_area_id) ?? 'Learning area')
        : subject
          ? `${subject.code} ${subject.name}`
          : task.name,
      detail: task.name,
      code: m.performance_level_code,
      score: m.score === null ? null : Number(m.score),
      maxScore: task.max_score === null ? null : Number(task.max_score),
      points: m.performance_level_code ? (pointsByCode.get(m.performance_level_code) ?? null) : null,
    }
  })

  // Attendance for this learner across the term, bounded by the term's own
  // dates. Filtered by student here rather than counting tenant-wide: a report
  // card that showed the school's absences would be both wrong and a privacy
  // problem.
  const { data: attendance } = await supabase
    .from('attendance_records')
    .select('status')
    .eq('tenant_id', session.tenantId)
    .eq('student_id', studentId)
    .gte('date', term.opened_on)
    .lte('date', term.closing_on)

  const own = (attendance ?? []) as { status: string }[]

  const present = own.filter((a) => a.status === 'present').length
  const late = own.filter((a) => a.status === 'late').length
  const excused = own.filter((a) => a.status === 'excused').length
  const absent = own.filter((a) => a.status === 'absent').length

  return {
    studentName: [student.first_name, student.other_names, student.surname]
      .filter(Boolean)
      .join(' '),
    admissionNo: student.student_no,
    classLabel: streamInfo?.classes?.label ?? '',
    streamLabel: streamInfo?.stream_label ?? '',
    termName: term.name,
    calendarYear: academicYear,
    lines: lines.sort((a, b) => a.label.localeCompare(b.label)),
    attendance: {
      present,
      absent,
      late,
      excused,
      rate: own.length > 0 ? Math.round(((present + late) / own.length) * 1000) / 10 : null,
    },
  }
}