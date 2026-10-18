'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/guards'
import {
  createYearSchema,
  promotionSchema,
  rollbackSchema,
  runPromotionSchema,
  sessionSchema,
  STRATEGY_LABELS,
  type PlanResult,
  type RollbackResult,
  type RunResult,
  type TermResult,
  type YearResult,
} from './schema'

/**
 * Transitions actions (CLAUDE.md section 7.10).
 *
 * Every mutation goes through a Postgres function rather than a table write,
 * because each carries an invariant a direct UPDATE would break: one active
 * term, one current year, one run per promotion.
 *
 * Promotion is deliberately two steps. `planPromotion` writes nothing and is
 * safe to run repeatedly; `runPromotion` is the only call that moves a learner.
 * The confirm screen therefore cannot commit a plan the admin never saw.
 */

/* ------------------------------------------------------------------ *
 * Academic years
 * ------------------------------------------------------------------ */

export async function createAcademicYear(
  _prev: YearResult | null,
  formData: FormData,
): Promise<YearResult> {
  await requirePermission('session.manage')

  const parsed = createYearSchema.safeParse({ calendarYear: formData.get('calendarYear') })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('academic_years')
    .select('calendar_year')
    .eq('calendar_year', parsed.data.calendarYear)

  if (existing && existing.length > 0) {
    return { ok: false, error: `Academic year ${parsed.data.calendarYear} already exists.` }
  }

  const { data, error } = await supabase.rpc('create_academic_year', {
    p_calendar_year: parsed.data.calendarYear,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  revalidatePath('/', 'layout')
  return { ok: true, yearId: data as string }
}

export async function setCurrentYear(
  _prev: TermResult | null,
  formData: FormData,
): Promise<TermResult> {
  await requirePermission('session.manage')

  const yearId = String(formData.get('yearId') ?? '')
  if (!yearId) return { ok: false, error: 'Choose an academic year.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_current_academic_year', { p_year: yearId })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/* ------------------------------------------------------------------ *
 * Sessions
 * ------------------------------------------------------------------ */

export async function saveSession(
  _prev: TermResult | null,
  formData: FormData,
): Promise<TermResult> {
  const session = await requirePermission('session.manage')

  const parsed = sessionSchema.safeParse({
    sessionId: formData.get('sessionId') ?? '',
    name: formData.get('name'),
    termNumber: formData.get('termNumber'),
    openedOn: formData.get('openedOn'),
    midtermBreakOn: formData.get('midtermBreakOn') ?? '',
    closingOn: formData.get('closingOn'),
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data: year } = await supabase
    .from('academic_years')
    .select('id')
    .eq('tenant_id', session.tenantId)
    .eq('is_current', true)
    .single()

  if (!year) return { ok: false, error: 'Set a current academic year first.' }

  const row = {
    name: parsed.data.name,
    term_number: parsed.data.termNumber,
    opened_on: parsed.data.openedOn,
    midterm_break_on: parsed.data.midtermBreakOn || null,
    closing_on: parsed.data.closingOn,
  }

  if (parsed.data.sessionId) {
    const { error } = await supabase
      .from('sessions')
      .update(row)
      .eq('id', parsed.data.sessionId)

    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase
      .from('sessions')
      .insert({ ...row, tenant_id: session.tenantId, academic_year_id: year.id, status: 'inactive' })

    if (error) {
      return {
        ok: false,
        error:
          error.code === '23505'
            ? `Term ${parsed.data.termNumber} already exists for this year.`
            : error.message,
      }
    }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function openTerm(
  _prev: TermResult | null,
  formData: FormData,
): Promise<TermResult> {
  await requirePermission('session.manage')

  const sessionId = String(formData.get('sessionId') ?? '')
  if (!sessionId) return { ok: false, error: 'Missing term.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('open_session', { p_session: sessionId })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function closeTerm(
  _prev: TermResult | null,
  formData: FormData,
): Promise<TermResult> {
  await requirePermission('session.manage')

  const sessionId = String(formData.get('sessionId') ?? '')
  if (!sessionId) return { ok: false, error: 'Missing term.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('close_session', { p_session: sessionId })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/* ------------------------------------------------------------------ *
 * Promotion
 * ------------------------------------------------------------------ */

/**
 * Dry run.
 *
 * Writes nothing. The admin reviews the plan and only then runs it, so no
 * learner can move on a plan nobody saw.
 */
export async function planPromotion(
  _prev: PlanResult | null,
  formData: FormData,
): Promise<PlanResult> {
  await requirePermission('promotion.run')

  const parsed = promotionSchema.safeParse({
    fromYear: formData.get('fromYear'),
    toYear: formData.get('toYear'),
    strategy: formData.get('strategy'),
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  if (parsed.data.fromYear === parsed.data.toYear) {
    return { ok: false, error: 'Choose two different academic years.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('promotion_plan', {
    p_from_year: parsed.data.fromYear,
    p_to_year: parsed.data.toYear,
    p_strategy: parsed.data.strategy,
  })

  if (error) return { ok: false, error: error.message }

  // The plan crosses into client code, so it is narrowed rather than cast. A
  // shape change in SQL shows up as a validation error instead of a blank table.
  const { promotionPlanSchema } = await import('./schema')
  const plan = promotionPlanSchema.safeParse(data)

  if (!plan.success) {
    return { ok: false, error: 'The promotion plan could not be read. Try again.' }
  }

  return { ok: true, plan: plan.data }
}

/** Create the destination year's streams, if the year has none yet. */
export async function prepareTargetYear(
  _prev: TermResult | null,
  formData: FormData,
): Promise<TermResult> {
  await requirePermission('promotion.run')

  const yearId = String(formData.get('yearId') ?? '')
  if (!yearId) return { ok: false, error: 'Missing academic year.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('ensure_streams_for_year', { p_year: yearId })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Commit a promotion.
 *
 * The run row is created and executed here rather than staged earlier, so there
 * is no window in which a half-staged run could be committed later by a
 * different caller. app.run_promotion() recomputes the plan internally, so
 * anything that changed since the dry run affects the committed result instead
 * of being silently ignored.
 *
 * When the plan cannot be honoured the whole run is abandoned: the row is
 * deleted, because a `dry_run` row that will never be run is not a record of
 * anything and would clutter the history.
 */
export async function runPromotion(
  _prev: RunResult | null,
  formData: FormData,
): Promise<RunResult> {
  const session = await requirePermission('promotion.run')

  const parsed = runPromotionSchema.safeParse({
    fromYear: formData.get('fromYear'),
    toYear: formData.get('toYear'),
    strategy: formData.get('strategy'),
    note: formData.get('note') ?? '',
  })

  if (!parsed.success) {
    return { ok: false, error: 'That promotion is no longer available. Run the dry run again.' }
  }

  const supabase = await createClient()

  // A promotion is out of a specific term. The active one is the term the
  // school is running, so it is what the run is recorded against.
  const { data: activeSession } = await supabase
    .from('sessions')
    .select('id')
    .eq('tenant_id', session.tenantId)
    .eq('status', 'active')
    .maybeSingle()

  if (!activeSession) {
    return { ok: false, error: 'Open a term before promoting. A promotion runs out of a term.' }
  }

  const { data: created, error: insertError } = await supabase
    .from('promotion_runs')
    .insert({
      tenant_id: session.tenantId,
      from_year_id: parsed.data.fromYear,
      to_year_id: parsed.data.toYear,
      from_session_id: activeSession.id,
      stream_strategy: parsed.data.strategy,
      status: 'dry_run',
      note: parsed.data.note || null,
    })
    .select('id')
    .single()

  const runId = created?.id

  if (insertError || !runId) {
    return { ok: false, error: insertError?.message ?? 'Could not start the promotion.' }
  }

  const { data, error } = await supabase.rpc('run_promotion', {
    p_run_id: runId,
    p_note: parsed.data.note || undefined,
  })

  if (error) {
    // The atomic abort raised, so no learner moved. The run row cannot be
    // deleted (promotion_runs_delete_denied), so it is marked `failed` instead:
    // the attempt happened, it was refused, and the reason is on the record.
    await supabase.rpc('discard_promotion_run', { p_run_id: runId, p_reason: error.message })
    return { ok: false, error: error.message }
  }

  const result = data as unknown as {
    runId: string
    total: number
    promoted: number
    held: number
    leftSchool: number
  }

  revalidatePath('/', 'layout')

  return {
    ok: true,
    runId: result.runId,
    total: result.total,
    promoted: result.promoted,
    held: result.held,
    leftSchool: result.leftSchool,
  }
}

export async function rollbackPromotion(
  _prev: RollbackResult | null,
  formData: FormData,
): Promise<RollbackResult> {
  await requirePermission('promotion.rollback')

  const parsed = rollbackSchema.safeParse({ runId: formData.get('runId') })

  if (!parsed.success) return { ok: false, error: 'That promotion is no longer available.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('rollback_promotion', { p_run_id: parsed.data.runId })

  if (error) return { ok: false, error: error.message }

  const result = data as { restored: number }

  revalidatePath('/', 'layout')
  return { ok: true, restored: result.restored }
}

export { STRATEGY_LABELS }