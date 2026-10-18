import 'server-only'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/auth/session'
import type { PromotionRunSummary } from './schema'

/**
 * Transitions reads (CLAUDE.md section 7.10).
 *
 * Aggregates are counted in SQL rather than in the browser: a session list with
 * an admissions count per term is a join over students, and doing it in JS
 * would pull every learner id into the browser to count them.
 */

export interface TermRow {
  id: string
  termNumber: number
  name: string
  openedOn: string
  midtermBreakOn: string | null
  closingOn: string
  status: 'active' | 'inactive'
  /** Learners admitted during this term. */
  admissions: number
}

export interface YearRow {
  id: string
  calendarYear: number
  startsOn: string
  endsOn: string
  isCurrent: boolean
  termCount: number
  learnerCount: number
}

export async function getTerms(): Promise<TermRow[]> {
  await connection()

  const supabase = await createClient()
  const session = await getSessionContext()

  const { data: sessions } = await supabase
    .from('sessions')
    .select(
      'id, term_number, name, opened_on, midterm_break_on, closing_on, status, academic_years!inner(tenant_id)',
    )
    .eq('academic_years.tenant_id', session.tenantId)
    .order('opened_on', { ascending: false })

  if (!sessions || sessions.length === 0) return []

  // One grouped query for every term rather than one per term.
  const { data: counts } = await supabase.rpc('term_admission_counts')

  const bySession = new Map<string, number>()
  for (const row of (counts ?? []) as { session_id: string; admissions: number }[]) {
    bySession.set(row.session_id, row.admissions)
  }

  return sessions.map((s) => ({
    id: s.id,
    termNumber: s.term_number as number,
    name: s.name,
    openedOn: s.opened_on,
    midtermBreakOn: s.midterm_break_on,
    closingOn: s.closing_on,
    status: s.status as 'active' | 'inactive',
    admissions: bySession.get(s.id) ?? 0,
  }))
}

export async function getYears(): Promise<YearRow[]> {
  await connection()

  const supabase = await createClient()
  const session = await getSessionContext()

  const { data: years } = await supabase
    .from('academic_years')
    .select('id, calendar_year, starts_on, ends_on, is_current')
    .eq('tenant_id', session.tenantId)
    .order('calendar_year', { ascending: false })

  if (!years || years.length === 0) return []

  const { data: termCounts } = await supabase
    .from('sessions')
    .select('academic_year_id')
    .eq('tenant_id', session.tenantId)

  const { data: learnerCounts } = await supabase
    .from('students')
    .select('current_stream_id, deleted_at')
    .eq('tenant_id', session.tenantId)
    .is('deleted_at', null)

  // Learner count per year needs the stream's year, so the stream ids are
  // resolved in one pass rather than a query per learner.
  const streamIds = [
    ...new Set((learnerCounts ?? []).map((l) => l.current_stream_id).filter(Boolean)),
  ] as string[]

  let yearByStream = new Map<string, string>()
  if (streamIds.length > 0) {
    const { data: streams } = await supabase
      .from('streams')
      .select('id, academic_year_id')
      .in('id', streamIds)
    yearByStream = new Map((streams ?? []).map((s) => [s.id, s.academic_year_id as string]))
  }

  const termsByYear = new Map<string, number>()
  for (const t of termCounts ?? []) {
    termsByYear.set(t.academic_year_id, (termsByYear.get(t.academic_year_id) ?? 0) + 1)
  }

  const learnersByYear = new Map<string, number>()
  for (const l of learnerCounts ?? []) {
    if (!l.current_stream_id) continue
    const yearId = yearByStream.get(l.current_stream_id)
    if (!yearId) continue
    learnersByYear.set(yearId, (learnersByYear.get(yearId) ?? 0) + 1)
  }

  return years.map((y) => ({
    id: y.id,
    calendarYear: y.calendar_year,
    startsOn: y.starts_on,
    endsOn: y.ends_on,
    isCurrent: y.is_current,
    termCount: termsByYear.get(y.id) ?? 0,
    learnerCount: learnersByYear.get(y.id) ?? 0,
  }))
}

export async function getPromotionRuns(limit = 20): Promise<PromotionRunSummary[]> {
  await connection()

  const supabase = await createClient()
  const session = await getSessionContext()

  const { data: runs } = await supabase
    .from('promotion_runs')
    .select(
      'id, status, stream_strategy, promoted_count, held_count, completed_count, created_at, note, from_year_id, to_year_id',
    )
    .eq('tenant_id', session.tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!runs || runs.length === 0) return []

  const { data: years } = await supabase
    .from('academic_years')
    .select('id, calendar_year')
    .eq('tenant_id', session.tenantId)

  const label = new Map((years ?? []).map((y) => [y.id, String(y.calendar_year)]))

  return runs.map((r) => ({
    id: r.id,
    status: r.status as PromotionRunSummary['status'],
    strategy: r.stream_strategy as PromotionRunSummary['strategy'],
    fromYearLabel: label.get(r.from_year_id) ?? '?',
    toYearLabel: label.get(r.to_year_id) ?? '?',
    promoted: r.promoted_count,
    held: r.held_count,
    leftSchool: r.completed_count,
    createdAt: r.created_at,
    note: r.note,
  }))
}

/**
 * Streams present in a target year, per class.
 *
 * The promotion screen needs to know whether the destination year has streams
 * before a run is attempted: without them every learner plans as `failed` and
 * the run aborts.
 */
export async function getStreamsForYear(academicYearId: string) {
  await connection()

  const supabase = await createClient()

  const { data: streams } = await supabase
    .from('streams')
    .select('id, class_id, stream_label')
    .eq('academic_year_id', academicYearId)
    .order('stream_label')

  const { data: classes } = await supabase
    .from('classes')
    .select('id, label')
    .order('sort_order')

  const classLabel = new Map((classes ?? []).map((c) => [c.id, c.label]))

  const byClass = new Map<string, number>()
  for (const s of streams ?? []) {
    byClass.set(s.class_id, (byClass.get(s.class_id) ?? 0) + 1)
  }

  return {
    total: (streams ?? []).length,
    byClass: [...byClass.entries()].map(([classId, count]) => ({
      classLabel: classLabel.get(classId) ?? '',
      count,
    })),
  }
}