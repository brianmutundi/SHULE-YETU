'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/guards'
import { getAcademicPeriod } from '@/lib/auth/period'
import {
  categoriesForMode,
  isEightPointCode,
  marksBatchSchema,
  taskSchema,
  type IssueResult,
  type MarksResult,
  type TaskResult,
} from './schema'

/**
 * Assessment actions (CLAUDE.md section 7.15).
 *
 * Marks are saved in one batch per stream per task, mirroring attendance: a
 * teacher entering forty results should not produce forty round trips, and a
 * half-saved mark sheet is worse than an untouched one.
 */

/**
 * Create an assessment.
 *
 * The category list is narrowed by the caller's operating mode before the write,
 * so a primary school is never offered a senior exam paper. The database refuses
 * it again in app.guard_assessment_task_mode(), because a client-side filter is
 * a convenience and not a control.
 */
export async function createTask(
  _prev: TaskResult | null,
  formData: FormData,
): Promise<TaskResult> {
  const session = await requirePermission('marks.record')

  const parsed = taskSchema.safeParse({
    name: formData.get('name'),
    category: formData.get('category'),
    sessionId: formData.get('sessionId') ?? '',
    learningAreaId: formData.get('learningAreaId') ?? '',
    subjectId: formData.get('subjectId') ?? '',
    maxScore: formData.get('maxScore') ?? '',
    weight: formData.get('weight') ?? '',
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const data = parsed.data
  const allowed = categoriesForMode(session.operatingMode)

  if (!allowed.some((c) => c === data.category)) {
    return {
      ok: false,
      error:
        session.operatingMode === 'senior'
          ? 'Senior assessments are continuous, end of term, or culminating.'
          : 'Basic-mode assessments are formative or summative.',
    }
  }

  // The mode decides which reference the task points at.
  if (session.operatingMode === 'senior' && !data.subjectId) {
    return { ok: false, error: 'Choose a subject for this assessment.' }
  }
  if (session.operatingMode === 'basic' && !data.learningAreaId) {
    return { ok: false, error: 'Choose a learning area for this assessment.' }
  }

  const supabase = await createClient()

  const { period } = await getAcademicPeriod()
  if (!period) return { ok: false, error: 'Set a current academic year first.' }

  const sessionId = data.sessionId || period.sessionId

  const { error } = await supabase.from('assessment_tasks').insert({
    tenant_id: session.tenantId,
    name: data.name,
    category: data.category,
    session_id: sessionId,
    academic_year_id: period.academicYearId,
    learning_area_id: session.operatingMode === 'basic' ? data.learningAreaId : null,
    subject_id: session.operatingMode === 'senior' ? data.subjectId : null,
    max_score: data.maxScore ? Number(data.maxScore) : null,
    weight: data.weight ? Number(data.weight) : null,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Edit an assessment's name, dates and weight. */
export async function updateTask(
  _prev: TaskResult | null,
  formData: FormData,
): Promise<TaskResult> {
  await requirePermission('marks.record')

  const taskId = String(formData.get('taskId') ?? '')
  if (!taskId) return { ok: false, error: 'Missing assessment.' }

  const parsed = taskSchema.safeParse({
    name: formData.get('name'),
    category: formData.get('category'),
    sessionId: formData.get('sessionId') ?? '',
    learningAreaId: formData.get('learningAreaId') ?? '',
    subjectId: formData.get('subjectId') ?? '',
    maxScore: formData.get('maxScore') ?? '',
    weight: formData.get('weight') ?? '',
  })

  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()

  const { error } = await supabase
    .from('assessment_tasks')
    .update({
      name: parsed.data.name,
      max_score: parsed.data.maxScore ? Number(parsed.data.maxScore) : null,
      weight: parsed.data.weight ? Number(parsed.data.weight) : null,
    })
    .eq('id', taskId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Save a mark sheet.
 *
 * The level/score choice is decided by the mode, and entries carrying the wrong
 * one are dropped with a reason rather than sent and rejected by the database:
 * a teacher who accidentally submitted scores on a CBC sheet should be told
 * which rows were wrong, not handed a constraint violation.
 */
export async function saveMarks(
  _prev: MarksResult | null,
  formData: FormData,
): Promise<MarksResult> {
  const session = await requirePermission('marks.record')

  let entries: unknown = []
  try {
    entries = JSON.parse(String(formData.get('entries') ?? '[]'))
  } catch {
    return { ok: false, error: 'The mark sheet could not be read. Reload and try again.' }
  }

  const parsed = marksBatchSchema.safeParse({
    taskId: formData.get('taskId'),
    streamId: formData.get('streamId'),
    entries,
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const { taskId, streamId, entries: batch } = parsed.data

  // Drop rows that cannot be right for this mode, reporting each.
  const usable: typeof batch = []
  const rejected: { studentId: string; outcome: 'failed'; message: string }[] = []

  for (const entry of batch) {
    const hasLevel = Boolean(entry.performanceLevelCode)
    const hasScore = Boolean(entry.score)

    if (session.operatingMode === 'basic') {
      if (hasScore && !hasLevel) {
        rejected.push({
          studentId: entry.studentId,
          outcome: 'failed',
          message: 'This school records competency levels, not scores.',
        })
        continue
      }
      if (hasLevel && !isEightPointCode(entry.performanceLevelCode as string)) {
        // The four-point scale is offered too, so accept any code the server
        // knows; an unknown code is caught by the database guard.
      }
    } else if (hasLevel && !hasScore) {
      rejected.push({
        studentId: entry.studentId,
        outcome: 'failed',
        message: 'This school records scores, not competency levels.',
      })
      continue
    }

    if (!hasLevel && !hasScore) continue // unchanged row, not sent

    usable.push(entry)
  }

  if (usable.length === 0) {
    return {
      ok: true,
      saved: 0,
      skipped: rejected.length,
      outcomes: rejected.map((r) => ({ ...r, outcome: 'failed' as const })),
    }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('save_marks', {
    p_task: taskId,
    p_stream: streamId,
    p_entries: usable.map((entry) => ({
      studentId: entry.studentId,
      performanceLevelCode: entry.performanceLevelCode || undefined,
      score: entry.score || undefined,
      note: entry.note || undefined,
    })),
  })

  if (error) return { ok: false, error: error.message }

  const result = data as unknown as {
    saved: number
    skipped: number
    errors: { studentId: string; message: string }[]
  }

  revalidatePath('/', 'layout')

  return {
    ok: true,
    saved: result.saved,
    skipped: result.skipped + rejected.length,
    outcomes: [
      ...(result.errors ?? []).map((e) => ({ ...e, outcome: 'failed' as const })),
      ...rejected.map((r) => ({ ...r, outcome: 'failed' as const })),
    ],
  }
}

/**
 * Issue report cards for a stream and term.
 *
 * A row per learner, created whether or not a PDF has been rendered yet. The
 * fact that a card was issued is the auditable part; the file can be
 * regenerated later without losing it.
 */
export async function issueReportCards(
  _prev: IssueResult | null,
  formData: FormData,
): Promise<IssueResult> {
  const session = await requirePermission('report_card.issue')

  const sessionId = String(formData.get('sessionId') ?? '')
  const streamId = String(formData.get('streamId') ?? '')

  if (!sessionId || !streamId) {
    return { ok: false, error: 'Choose a term and a class.' }
  }

  const supabase = await createClient()

  // Learners in the stream, so the issue list and the printed set agree.
  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('id')
    .eq('tenant_id', session.tenantId)
    .eq('current_stream_id', streamId)
    .is('deleted_at', null)
    .in('status', ['active', 'draft'])

  if (studentsError) return { ok: false, error: studentsError.message }

  const learnerIds = (students ?? []).map((s) => s.id)

  if (learnerIds.length === 0) {
    return { ok: false, error: 'No learners in that class.' }
  }

  const { error } = await supabase
    .from('report_cards')
    .upsert(
      learnerIds.map((studentId) => ({
        tenant_id: session.tenantId,
        student_id: studentId,
        session_id: sessionId,
        issued_by: session.userId,
      })),
      { onConflict: 'student_id,session_id' },
    )

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true, issued: learnerIds.length, studentIds: learnerIds }
}

/** Release a checkpoint result so a held learner can be promoted (section 7.10). */
export async function releaseCheckpoint(
  _prev: TaskResult | null,
  formData: FormData,
): Promise<TaskResult> {
  const session = await requirePermission('exam_record')

  const studentId = String(formData.get('studentId') ?? '')
  const checkpoint = String(formData.get('checkpoint') ?? '')
  const academicYearId = String(formData.get('academicYearId') ?? '')

  if (!studentId || !checkpoint || !academicYearId) {
    return { ok: false, error: 'Missing checkpoint details.' }
  }

  if (checkpoint !== 'KPSEA' && checkpoint !== 'KJSEA') {
    return { ok: false, error: 'Choose KPSEA or KJSEA.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.from('checkpoint_results').upsert(
    {
      tenant_id: session.tenantId,
      student_id: studentId,
      checkpoint,
      academic_year_id: academicYearId,
      status: 'released',
      released_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,checkpoint,academic_year_id' },
  )

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}