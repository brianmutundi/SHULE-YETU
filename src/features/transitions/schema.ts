import { z } from 'zod'

/**
 * Transitions types (CLAUDE.md section 7.10).
 *
 * Three tabs: sessions, academic years and promotions. The shapes here are what
 * cross the server/client boundary; the promotion plan itself comes back as
 * jsonb from app.promotion_plan() and is narrowed here rather than trusted.
 */

/** Stream assignment strategy, chosen at promotion time ([A11]). */
export const STREAM_STRATEGIES = ['keep', 'balance'] as const
export type StreamStrategy = (typeof STREAM_STRATEGIES)[number]

export const streamStrategySchema = z.enum(STREAM_STRATEGIES, {
  message: 'Choose how learners are assigned to streams',
})

export const promotionPlanSchema = z.object({
  fromYear: z.string().uuid(),
  toYear: z.string().uuid(),
  strategy: z.enum(STREAM_STRATEGIES),
  total: z.number(),
  promoted: z.number(),
  held: z.number(),
  leftSchool: z.number(),
  failed: z.number(),
  schoolType: z.string(),
  rows: z
    .array(
      z.object({
        id: z.string().uuid(),
        student_no: z.string(),
        first_name: z.string(),
        other_names: z.string().nullable().optional(),
        surname: z.string().nullable().optional(),
        status: z.string(),
        from_class_label: z.string(),
        stream_label: z.string(),
        to_class_label: z.string().nullable().optional(),
        to_stream_id: z.string().nullable(),
        checkpoint: z.string().nullable().optional(),
        outcome: z.enum(['promoted', 'held', 'completed', 'graduated', 'failed']),
        reason: z.string().nullable().optional(),
      }),
    )
    .default([]),
  heldDetail: z.array(z.record(z.string(), z.unknown())).default([]),
})

export type PromotionPlan = z.infer<typeof promotionPlanSchema>
export type PromotionRow = PromotionPlan['rows'][number]

/** A held learner, as the summary shows them. */
export interface HeldLearner {
  studentId: string
  studentNo: string
  name: string
  fromClass: string
  stream: string
  checkpoint: string | null
  reason: string | null
}

/** Existing promotion runs, newest first. */
export interface PromotionRunSummary {
  id: string
  status: RunStatus
  strategy: StreamStrategy
  fromYearLabel: string
  toYearLabel: string
  promoted: number
  held: number
  leftSchool: number
  createdAt: string
  note: string | null
}

export type PlanResult = { ok: true; plan: PromotionPlan } | { ok: false; error: string }

export type RunResult =
  | { ok: true; runId: string; total: number; promoted: number; held: number; leftSchool: number }
  | { ok: false; error: string }

export type RollbackResult = { ok: true; restored: number } | { ok: false; error: string }

export type YearResult = { ok: true; yearId: string } | { ok: false; error: string }

export type TermResult = { ok: true } | { ok: false; error: string }

/** Promotion attempts, newest first. `failed` is a run that was refused. */
export type RunStatus = 'dry_run' | 'completed' | 'rolled_back' | 'failed'

/** Create-year form. */
export const createYearSchema = z.object({
  calendarYear: z.coerce
    .number()
    .int('Enter a whole year')
    .min(2000, 'Enter a year between 2000 and 2100')
    .max(2100, 'Enter a year between 2000 and 2100'),
})

export type CreateYearInput = z.input<typeof createYearSchema>

/** Term form. Every date is editable; the defaults are Kenyan assumptions. */
export const sessionSchema = z
  .object({
    sessionId: z.string().uuid().optional().or(z.literal('')),
    name: z.string().trim().min(1, 'Name the term').max(60),
    termNumber: z.coerce.number().int().min(1).max(3),
    openedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date'),
    midtermBreakOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
      .optional()
      .or(z.literal('')),
    closingOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date'),
  })
  .refine((v) => v.closingOn > v.openedOn, {
    message: 'The closing date must be after the opening date',
    path: ['closingOn'],
  })
  .refine(
    (v) => !v.midtermBreakOn || (v.midtermBreakOn > v.openedOn && v.midtermBreakOn < v.closingOn),
    { message: 'The midterm break must fall between opening and closing', path: ['midtermBreakOn'] },
  )

export type SessionInput = z.input<typeof sessionSchema>

/** Promotion form. */
export const promotionSchema = z.object({
  fromYear: z.string().uuid('Choose the year being promoted out of'),
  toYear: z.string().uuid('Choose the year being promoted into'),
  strategy: streamStrategySchema,
})

export type PromotionInput = z.infer<typeof promotionSchema>

/**
 * Commit a promotion.
 *
 * Carries the years rather than a staged run id: the run row is created and
 * executed in the same action, so there is never a pending run id lying around
 * for a different caller to commit.
 */
export const runPromotionSchema = z.object({
  fromYear: z.string().uuid('That academic year is no longer available. Run the dry run again.'),
  toYear: z.string().uuid('That academic year is no longer available. Run the dry run again.'),
  strategy: streamStrategySchema,
  note: z.string().trim().max(200).optional().or(z.literal('')),
})

export const rollbackSchema = z.object({ runId: z.string().uuid() })

/**
 * Labels for the strategy choice.
 *
 * Neither option is presented as the correct one. Which is right depends on the
 * school: some keep a learner in the same stream all year, some re-shuffle
 * cohorts so streams stay evenly sized ([A11]).
 */
export const STRATEGY_LABELS: Record<StreamStrategy, { label: string; help: string }> = {
  keep: {
    label: 'Keep the current stream',
    help: 'A learner in Grade 5 A moves to Grade 6 A. Predictable, so families can be told in advance.',
  },
  balance: {
    label: 'Re-shuffle to balance streams',
    help: 'Learners are spread across the next class’s streams to even out sizes. The dry run shows exactly who goes where.',
  },
}